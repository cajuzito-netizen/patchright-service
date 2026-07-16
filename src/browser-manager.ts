/**
 * Browser Manager
 * 
 * Handles Chrome processes with Patchright.
 * 
 * Each "browser" is a BrowserContext (isolated session):
 * - Own cookies, localStorage, cache
 * - Optional proxy
 * - Can persist to disk (via user_data_dir)
 * 
 * Concurrency:
 * - Multiple browsers can run in parallel
 * - Each page has a mutex (operations serialized per page)
 * - Different pages run concurrently
 */

import { chromium, BrowserContext, Page } from 'patchright';
import { v4 as uuidv4 } from 'uuid';
import config from './config.js';
import { Browser, PageInfo } from './types.js';

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

/** Internal state for a browser */
interface BrowserState {
  info: Browser;
  context: BrowserContext;
  pages: Map<string, { page: Page; mutex: Mutex }>;
}

class BrowserManager {
  private browsers = new Map<string, BrowserState>();

  /**
   * Create a new browser
   * 
   * @param profileName - Profile to use (for proxy and persistence)
   */
  async create(profileName: string): Promise<Browser> {
    const id = uuidv4();
    const profilesDir = config.profilesDir;

    // Create context with user_data_dir for persistence
    const context = await chromium.launchPersistentContext({
      userDataDir: `${profilesDir}/${profileName}`,
      channel: 'chrome',
      headless: false,
      noViewport: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    // Create initial page
    const page = await context.newPage();
    const pageId = uuidv4();

    const info: Browser = {
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
   * Close a browser
   */
  async close(browserId: string): Promise<boolean> {
    const state = this.browsers.get(browserId);
    if (!state) return false;

    await state.context.close().catch(() => {});
    this.browsers.delete(browserId);
    return true;
  }

  /**
   * Get browser info
   */
  get(browserId: string): Browser | null {
    return this.browsers.get(browserId)?.info || null;
  }

  /**
   * List all browsers
   */
  list(): Browser[] {
    return Array.from(this.browsers.values()).map(s => s.info);
  }

  /**
   * Create a new page in a browser
   */
  async createPage(browserId: string): Promise<PageInfo | null> {
    const state = this.browsers.get(browserId);
    if (!state) return null;

    const page = await state.context.newPage();
    const pageId = uuidv4();

    state.pages.set(pageId, { page, mutex: new Mutex() });

    return { id: pageId, url: page.url(), title: '' };
  }

  /**
   * Get a page
   */
  getPage(browserId: string, pageId: string): Page | null {
    const state = this.browsers.get(browserId);
    if (!state) return null;

    return state.pages.get(pageId)?.page || null;
  }

  /**
   * Get mutex for a page
   */
  getMutex(browserId: string, pageId: string): Mutex | null {
    const state = this.browsers.get(browserId);
    if (!state) return null;

    return state.pages.get(pageId)?.mutex || null;
  }

  /**
   * Execute operation on page (with mutex)
   */
  async exec<T>(browserId: string, pageId: string, fn: (page: Page) => Promise<T>): Promise<T> {
    const page = this.getPage(browserId, pageId);
    if (!page) throw new Error(`Page ${pageId} not found`);

    const mutex = this.getMutex(browserId, pageId);
    if (!mutex) throw new Error(`No mutex for page ${pageId}`);

    await mutex.acquire();
    try {
      return await fn(page);
    } finally {
      mutex.release();
    }
  }
}

export const browserManager = new BrowserManager();
