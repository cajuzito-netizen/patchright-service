/**
 * Browser Manager with Context Pooling + Caching
 * 
 * Two-level pooling:
 * 1. Chrome Pool: Fixed number of Chrome processes
 * 2. Context Pool: Reusable BrowserContexts (lightweight)
 * 
 * Flow:
 * - Pre-create Chrome processes
 * - Pre-create BrowserContexts for each Chrome
 * - When user requests: Give them a cached context
 * - When user done: Return context to pool (ready to reuse)
 * 
 * This is like a database connection pool!
 */

import { chromium, Browser, BrowserContext, Page } from 'patchright';
import { v4 as uuidv4 } from 'uuid';
import { Browser as BrowserInfo, PageInfo } from './types.js';

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
}

class BrowserManager {
  /** Chrome processes */
  private chromePool: Browser[] = [];
  
  /** Cached, ready-to-use contexts */
  private contextPool: BrowserContext[] = [];
  
  /** Active sessions using contexts */
  private browsers = new Map<string, ManagedBrowser>();
  
  /** Locks */
  private chromeLock = false;
  private contextLock = false;
  
  private readonly maxChrome = 3;
  private readonly maxContexts = 10;  // Total contexts (active + cached)
  private readonly preWarmContexts = 5; // Pre-create this many

  constructor() {
    // Pre-warm on startup
    this.initialize();
  }

  private async initialize() {
    console.log('Initializing browser pool...');
    await this.ensureChromePool();
    await this.warmContextPool();
    console.log(`Ready: ${this.chromePool.length} Chrome, ${this.contextPool.length} cached contexts`);
  }

  // ==================== Chrome Pool ====================

  private async ensureChromePool(): Promise<void> {
    while (this.chromePool.length < this.maxChrome) {
      if (this.chromeLock) {
        await new Promise(r => setTimeout(r, 100));
        continue;
      }
      this.chromeLock = true;
      try {
        const browser = await chromium.launch({
          channel: 'chrome',
          headless: false,
          args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        });
        this.chromePool.push(browser);
        console.log(`Chrome pool: ${this.chromePool.length}/${this.maxChrome}`);
      } finally {
        this.chromeLock = false;
      }
    }
  }

  // ==================== Context Pool ====================

  private async warmContextPool(): Promise<void> {
    while (this.contextPool.length < this.preWarmContexts) {
      if (this.contextLock) {
        await new Promise(r => setTimeout(r, 100));
        continue;
      }
      await this.createCachedContext();
    }
  }

  private async createCachedContext(): Promise<BrowserContext | null> {
    if (this.contextPool.length >= this.maxContexts) return null;
    if (this.chromePool.length === 0) return null;

    this.contextLock = true;
    try {
      // Round-robin across Chrome instances
      const chromeIndex = this.contextPool.length % this.chromePool.length;
      const chrome = this.chromePool[chromeIndex];
      const context = await chrome.newContext();
      this.contextPool.push(context);
      return context;
    } finally {
      this.contextLock = false;
    }
  }

  private async getContextFromPool(): Promise<BrowserContext> {
    // Try to get cached context
    if (this.contextPool.length > 0) {
      return this.contextPool.pop()!;
    }

    // Create new one if under limit
    const context = await this.createCachedContext();
    if (context) return context;

    // Wait and retry
    await new Promise(r => setTimeout(r, 100));
    return this.getContextFromPool();
  }

  private async returnContextToPool(context: BrowserContext): Promise<void> {
    // Close all pages in context
    for (const page of context.pages()) {
      await page.close().catch(() => {});
    }

    // Check if we have space
    if (this.contextPool.length < this.maxContexts) {
      this.contextPool.push(context);
      console.log(`Context pool: ${this.contextPool.length} cached`);
    } else {
      await context.close().catch(() => {});
    }
  }

  // ==================== Public API ====================

  async create(profileName: string): Promise<BrowserInfo> {
    const id = uuidv4();
    const context = await this.getContextFromPool();
    const page = await context.newPage();
    const pageId = uuidv4();

    const info: BrowserInfo = {
      id,
      profileName,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    this.browsers.set(id, {
      info,
      context,
      pages: new Map([[pageId, { page, mutex: new Mutex() }]]),
    });

    return info;
  }

  async close(browserId: string): Promise<boolean> {
    const managed = this.browsers.get(browserId);
    if (!managed) return false;

    // Return context to pool instead of destroying
    await this.returnContextToPool(managed.context);
    this.browsers.delete(browserId);
    return true;
  }

  get(browserId: string): BrowserInfo | null {
    return this.browsers.get(browserId)?.info || null;
  }

  list(): BrowserInfo[] {
    return Array.from(this.browsers.values()).map(m => m.info);
  }

  async createPage(browserId: string): Promise<PageInfo | null> {
    const managed = this.browsers.get(browserId);
    if (!managed) return null;
    const page = await managed.context.newPage();
    const pageId = uuidv4();
    managed.pages.set(pageId, { page, mutex: new Mutex() });
    return { id: pageId, url: page.url(), title: '' };
  }

  async exec<T>(browserId: string, pageId: string, fn: (page: Page) => Promise<T>): Promise<T> {
    const managed = this.browsers.get(browserId);
    if (!managed) throw new Error(`Browser ${browserId} not found`);
    const pageData = managed.pages.get(pageId);
    if (!pageData) throw new Error(`Page ${pageId} not found`);
    await pageData.mutex.acquire();
    try {
      return await fn(pageData.page);
    } finally {
      pageData.mutex.release();
    }
  }

  getStats() {
    return {
      chromeProcesses: this.chromePool.length,
      cachedContexts: this.contextPool.length,
      activeSessions: this.browsers.size,
      maxChrome: this.maxChrome,
      maxContexts: this.maxContexts,
    };
  }
}

export const browserManager = new BrowserManager();
