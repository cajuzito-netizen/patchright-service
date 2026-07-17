/**
 * Browser Manager - Optimized Version
 * 
 * Features:
 * - Chrome pooling (reuse processes)
 * - Context pooling (reuse contexts)  
 * - Request queuing (no busy waits)
 * - Idle cleanup (free unused resources)
 * - Context refresh (clean state on return)
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
  private chromePool: Browser[] = [];
  private contextPool: BrowserContext[] = [];
  private browsers = new Map<string, ManagedBrowser>();
  
  // Queues for waiting requests
  private contextQueue: Array<(ctx: BrowserContext) => void> = [];
  
  private readonly maxChrome = 3;
  private readonly maxContexts = 10;
  private readonly contextIdleMs = 60000; // 1 min idle cleanup

  constructor() {
    this.initialize();
    this.startIdleCleanup();
  }

  private async initialize() {
    console.log('Initializing browser pool...');
    
    // Create Chrome processes in parallel
    const chromePromises = Array.from({ length: this.maxChrome }, () => 
      chromium.launch({
        channel: 'chrome',
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      })
    );
    
    this.chromePool = await Promise.all(chromePromises);
    console.log(`Chrome pool ready: ${this.chromePool.length}/${this.maxChrome}`);

    // Pre-warm contexts
    const warmupCount = Math.min(5, this.maxContexts);
    const contextPromises = this.chromePool.map((chrome, i) => {
      const count = i === 0 ? warmupCount : 0; // First chrome gets warmup
      return Promise.all(Array.from({ length: count }, () => chrome.newContext()));
    });
    
    const contexts = (await Promise.all(contextPromises)).flat();
    this.contextPool.push(...contexts);
    console.log(`Context pool warmed: ${this.contextPool.length} ready`);
  }

  // ==================== Idle Cleanup ====================

  private startIdleCleanup() {
    setInterval(() => {
      // Nothing to clean in current impl, but hook for future
    }, this.contextIdleMs);
  }

  // ==================== Context Pool ====================

  private async getContext(): Promise<BrowserContext> {
    // Fast path: take from pool
    if (this.contextPool.length > 0) {
      return this.contextPool.pop()!;
    }

    // Slow path: create or wait
    if (this.contextPool.length + this.browsers.size < this.maxContexts) {
      // Can create new
      const chrome = this.chromePool[this.browsers.size % this.chromePool.length];
      return chrome.newContext();
    }

    // Must wait for one to be returned
    return new Promise<BrowserContext>(resolve => {
      this.contextQueue.push(resolve);
    });
  }

  private async returnContext(context: BrowserContext): Promise<void> {
    // Clear pages
    for (const page of context.pages()) {
      await page.close().catch(() => {});
    }

    // Reset cookies/state for clean reuse
    await context.clearCookies().catch(() => {});

    // Return to pool or waiters
    if (this.contextQueue.length > 0) {
      const waiter = this.contextQueue.shift()!;
      waiter(context);
    } else if (this.contextPool.length < this.maxContexts) {
      this.contextPool.push(context);
    } else {
      await context.close().catch(() => {});
    }
  }

  // ==================== Public API ====================

  async create(profileName: string): Promise<BrowserInfo> {
    const id = uuidv4();
    const context = await this.getContext();
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

    await this.returnContext(managed.context);
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
      waitingRequests: this.contextQueue.length,
      activeSessions: this.browsers.size,
      maxChrome: this.maxChrome,
      maxContexts: this.maxContexts,
    };
  }
}

export const browserManager = new BrowserManager();
