/**
 * Browser Manager with POOLING (fixed race condition)
 * 
 * Creates a fixed number of Chrome processes and REUSES them.
 * Each user gets a lightweight BrowserContext, not a new Chrome process.
 */

import { chromium, Browser, BrowserContext, Page } from 'patchright';
import { v4 as uuidv4 } from 'uuid';
import { Browser as BrowserInfo, PageInfo } from './types.js';

/** Mutex for serializing page operations */
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
  /** Pool of Chrome processes */
  private pool: Browser[] = [];
  
  /** Active browser sessions */
  private browsers = new Map<string, ManagedBrowser>();
  
  /** Lock for creating browsers */
  private creating = false;
  private createQueue: (() => void)[] = [];
  
  private readonly maxBrowsers = 3;

  /**
   * Wait for pool to have capacity, then create browser
   */
  private async getBrowserFromPool(): Promise<Browser> {
    // If we have browsers in pool, reuse one
    if (this.pool.length > 0 && this.pool.length <= this.maxBrowsers) {
      return this.pool[this.pool.length - 1];
    }

    // If under limit, create new (with lock)
    if (this.pool.length < this.maxBrowsers) {
      // Wait if another is creating
      while (this.creating) {
        await new Promise<void>(r => this.createQueue.push(r));
      }
      
      // Double check after waiting
      if (this.pool.length < this.maxBrowsers) {
        this.creating = true;
        try {
          const browser = await chromium.launch({
            channel: 'chrome',
            headless: false,
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
          });
          this.pool.push(browser);
          console.log(`Chrome pool: ${this.pool.length}/${this.maxBrowsers}`);
          return browser;
        } finally {
          this.creating = false;
          this.createQueue.forEach(r => r());
          this.createQueue = [];
        }
      }
    }

    // All browsers busy - reuse first one (contexts are isolated)
    return this.pool[0];
  }

  async create(profileName: string): Promise<BrowserInfo> {
    const id = uuidv4();
    const browser = await this.getBrowserFromPool();
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageId = uuidv4();

    const info: BrowserInfo = {
      id,
      profileName,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    this.browsers.set(id, { info, context, pages: new Map([[pageId, { page, mutex: new Mutex() }]]) });
    return info;
  }

  async close(browserId: string): Promise<boolean> {
    const managed = this.browsers.get(browserId);
    if (!managed) return false;
    await managed.context.close().catch(() => {});
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
      chromeProcesses: this.pool.length,
      maxChromeProcesses: this.maxBrowsers,
      activeSessions: this.browsers.size,
    };
  }
}

export const browserManager = new BrowserManager();
