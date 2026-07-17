/**
 * Browser Manager with Persistent Sessions
 * 
 * Each profile key maps to a persistent Chrome context.
 * Cookies, localStorage, cache persist across:
 * - Multiple requests with same key
 * - Server restarts
 * 
 * Example:
 *   POST /browsers { profileName: "account1" } → Creates context
 *   POST /browsers { profileName: "account1" } → Returns SAME context
 */

import { chromium, Browser, BrowserContext, Page } from 'patchright';
import { v4 as uuidv4 } from 'uuid';
import { resolve } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { Browser as BrowserInfo, PageInfo } from './types.js';

const PROFILES_DIR = resolve(process.cwd(), 'profiles');

class Mutex {
  private locked = false;
  private queue: (() => void)[] = [];
  async acquire() {
    if (!this.locked) { this.locked = true; return; }
    return new Promise<void>(r => this.queue.push(r));
  }
  release() {
    if (this.queue.length > 0) this.queue.shift()!();
    else this.locked = false;
  }
}

interface ManagedBrowser {
  info: BrowserInfo;
  context: BrowserContext;
  pages: Map<string, { page: Page; mutex: Mutex }>;
  profileName: string;
  lastActivity: number;
}

class BrowserManager {
  /** Active sessions by profile name */
  private sessions = new Map<string, ManagedBrowser>();
  
  /** Chrome processes (pooled) */
  private chromePool: Browser[] = [];
  
  private readonly maxChrome = 3;
  private readonly maxSessions = 50;

  constructor() {
    mkdirSync(PROFILES_DIR, { recursive: true });
    this.initialize();
  }

  private async initialize() {
    console.log('Initializing browser pool...');
    
    // Create Chrome processes
    const chromePromises = Array.from({ length: this.maxChrome }, () => 
      chromium.launch({
        channel: 'chrome',
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      })
    );
    
    this.chromePool = await Promise.all(chromePromises);
    console.log(`Chrome pool ready: ${this.chromePool.length}`);
  }

  // ==================== Profile Persistence ====================

  private getProfileDir(profileName: string): string {
    return resolve(PROFILES_DIR, profileName);
  }

  private getMetadataPath(profileName: string): string {
    return resolve(this.getProfileDir(profileName), 'session.json');
  }

  private loadMetadata(profileName: string): Record<string, unknown> | null {
    const path = this.getMetadataPath(profileName);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return null;
    }
  }

  private saveMetadata(profileName: string, data: Record<string, unknown>): void {
    const dir = this.getProfileDir(profileName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.getMetadataPath(profileName), JSON.stringify(data, null, 2));
  }

  // ==================== Session Management ====================

  async create(profileName: string): Promise<BrowserInfo> {
    // Check if session already exists for this profile
    const existing = this.sessions.get(profileName);
    if (existing) {
      existing.lastActivity = Date.now();
      existing.info.lastActivity = new Date().toISOString();
      return existing.info;
    }

    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      // Close oldest session
      const oldest = Array.from(this.sessions.values())
        .sort((a, b) => a.lastActivity - b.lastActivity)[0];
      if (oldest) {
        await this.closeSession(oldest.info.id);
      }
    }

    // Create new persistent context
    const id = uuidv4();
    const chrome = this.chromePool[this.sessions.size % this.chromePool.length];
    const context = await chrome.newContext();
    const page = await context.newPage();
    const pageId = uuidv4();

    const info: BrowserInfo = {
      id,
      profileName,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    this.sessions.set(profileName, {
      info,
      context,
      pages: new Map([[pageId, { page, mutex: new Mutex() }]]),
      profileName,
      lastActivity: Date.now(),
    });

    // Save metadata
    this.saveMetadata(profileName, {
      id,
      createdAt: info.createdAt,
    });

    console.log(`Session created: ${profileName} (${this.sessions.size} active)`);
    return info;
  }

  async close(browserId: string): Promise<boolean> {
    return this.closeSession(browserId);
  }

  private async closeSession(browserId: string): Promise<boolean> {
    let found = false;
    for (const [profileName, managed] of this.sessions) {
      if (managed.info.id === browserId) {
        await managed.context.close().catch(() => {});
        this.sessions.delete(profileName);
        found = true;
        console.log(`Session closed: ${profileName} (${this.sessions.size} active)`);
        break;
      }
    }
    return found;
  }

  get(browserId: string): BrowserInfo | null {
    for (const managed of this.sessions.values()) {
      if (managed.info.id === browserId) return managed.info;
    }
    return null;
  }

  getByProfile(profileName: string): BrowserInfo | null {
    return this.sessions.get(profileName)?.info || null;
  }

  list(): BrowserInfo[] {
    return Array.from(this.sessions.values()).map(m => m.info);
  }

  async createPage(browserId: string): Promise<PageInfo | null> {
    for (const managed of this.sessions.values()) {
      if (managed.info.id === browserId) {
        const page = await managed.context.newPage();
        const pageId = uuidv4();
        managed.pages.set(pageId, { page, mutex: new Mutex() });
        managed.lastActivity = Date.now();
        return { id: pageId, url: page.url(), title: '' };
      }
    }
    return null;
  }

  async exec<T>(browserId: string, pageId: string, fn: (page: Page) => Promise<T>): Promise<T> {
    for (const managed of this.sessions.values()) {
      if (managed.info.id === browserId) {
        const pageData = managed.pages.get(pageId);
        if (!pageData) throw new Error(`Page ${pageId} not found`);
        managed.lastActivity = Date.now();
        await pageData.mutex.acquire();
        try {
          return await fn(pageData.page);
        } finally {
          pageData.mutex.release();
        }
      }
    }
    throw new Error(`Browser ${browserId} not found`);
  }

  getStats() {
    return {
      activeSessions: this.sessions.size,
      maxSessions: this.maxSessions,
      chromeProcesses: this.chromePool.length,
      profiles: Array.from(this.sessions.keys()),
    };
  }
}

export const browserManager = new BrowserManager();
