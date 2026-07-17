/**
 * Browser Manager with POOLING
 * 
 * Creates a fixed number of Chrome processes and REUSES them.
 * Each user gets a lightweight BrowserContext, not a new Chrome process.
 * 
 * Architecture:
 * 
 * Chrome Pool (fixed size, e.g. 3)
 * ├── Chrome Process 1
 * │   ├── Context for User A (lightweight)
 * │   ├── Context for User B (lightweight)
 * │   └── Context for User C (lightweight)
 * ├── Chrome Process 2
 * │   ├── Context for User D
 * │   └── Context for User E
 * └── Chrome Process 3
 *     └── ...
 * 
 * This is how Playwright is designed to work!
 */

import { chromium, Browser, BrowserContext, Page } from 'patchright';
import { v4 as uuidv4 } from 'uuid';
import config from './config.js';
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

/** Represents a managed browser session */
interface ManagedBrowser {
  info: BrowserInfo;
  context: BrowserContext;
  pages: Map<string, { page: Page; mutex: Mutex }>;
}

class BrowserManager {
  /** Pool of Chrome processes */
  private pool: Browser[] = [];
  
  /** Active browser sessions (contexts) */
  private browsers = new Map<string, ManagedBrowser>();
  
  /** Max Chrome processes to maintain */
  private readonly maxBrowsers = 3;

  /**
   * Get or create a Chrome process from the pool
   */
  private async getBrowserFromPool(): Promise<Browser> {
    // Reuse existing browser if available
    if (this.pool.length > 0) {
      return this.pool[0]; // Simple round-robin
    }

    // Create new browser if under limit
    if (this.pool.length < this.maxBrowsers) {
      const browser = await chromium.launch({
        channel: 'chrome',
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
        ],
      });
      this.pool.push(browser);
      console.log(`Created browser pool: ${this.pool.length}/${this.maxBrowsers}`);
      return browser;
    }

    // All browsers busy - use first one (contexts are isolated anyway)
    return this.pool[0];
  }

  /**
   * Create a new browser session
   * 
   * Instead of creating a new Chrome process,
   * this creates a lightweight BrowserContext on an existing browser.
   */
  async create(profileName: string): Promise<BrowserInfo> {
    const id = uuidv4();
    const browser = await this.getBrowserFromPool();

    // Create a new context (lightweight, isolated)
    // Each context has its own cookies, storage, etc.
    const context = await browser.newContext();

    // Create initial page
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

  /**
   * Close a browser session (not the Chrome process!)
   */
  async close(browserId: string): Promise<boolean> {
    const managed = this.browsers.get(browserId);
    if (!managed) return false;

    // Close the context (lightweight)
    await managed.context.close().catch(() => {});
    this.browsers.delete(browserId);
    
    console.log(`Active sessions: ${this.browsers.size}`);
    return true;
  }

  /**
   * Get browser info
   */
  get(browserId: string): BrowserInfo | null {
    return this.browsers.get(browserId)?.info || null;
  }

  /**
   * List all browsers
   */
  list(): BrowserInfo[] {
    return Array.from(this.browsers.values()).map(m => m.info);
  }

  /**
   * Create a new page in a browser
   */
  async createPage(browserId: string): Promise<PageInfo | null> {
    const managed = this.browsers.get(browserId);
    if (!managed) return null;

    const page = await managed.context.newPage();
    const pageId = uuidv4();

    managed.pages.set(pageId, { page, mutex: new Mutex() });

    return { id: pageId, url: page.url(), title: '' };
  }

  /**
   * Execute operation on page (with mutex)
   */
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

  /**
   * Get pool stats
   */
  getStats() {
    return {
      chromeProcesses: this.pool.length,
      maxChromeProcesses: this.maxBrowsers,
      activeSessions: this.browsers.size,
    };
  }
}

export const browserManager = new BrowserManager();
