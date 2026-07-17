/**
 * API Routes
 * 
 * Simple REST API for browser automation.
 */

import { Router, Request, Response } from 'express';
import { browserManager } from './browser-manager.js';
import {
  ApiResponse,
  CreateProfileRequest,
  CreateBrowserRequest,
  GotoRequest,
  ClickRequest,
  FillRequest,
  TypeRequest,
  EvalRequest,
} from './types.js';

const router: ReturnType<typeof Router> = Router();

// Request timeout middleware
const TIMEOUT_MS = 60000; // 60s
router.use((req, res, next) => {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({ success: false, message: 'Request timeout' });
    }
  }, TIMEOUT_MS);
  
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
});

// ==================== Stats ====================

router.get('/stats', (_req: Request, res: Response<ApiResponse>) => {
  const stats = browserManager.getStats();
  res.json({ success: true, message: 'Stats', data: stats });
});

// ==================== Profiles ====================

router.post('/profiles', (_req: Request, res: Response<ApiResponse>) => {
  res.json({ success: true, message: 'Profile will be created when browser starts' });
});

// ==================== Browsers ====================

/**
 * POST /browsers - Create a new browser
 * 
 * Body: { profileName: string }
 * 
 * Creates a Chrome context with:
 * - Persistent storage in profiles/<name>/
 * - Stealth patches
 * - Ready to use
 */
router.post('/browsers', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { profileName } = req.body as CreateBrowserRequest;
    if (!profileName) {
      return res.status(400).json({ success: false, message: 'profileName required' });
    }

    const browser = await browserManager.create(profileName);
    res.json({ success: true, message: 'Browser created', data: browser });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

/** GET /browsers - List all browsers */
router.get('/browsers', (_req: Request, res: Response<ApiResponse>) => {
  const browsers = browserManager.list();
  res.json({ success: true, message: 'Browsers listed', data: browsers });
});

/** GET /browsers/profile/:name - Get browser by profile name */
router.get('/browsers/profile/:name', (req: Request, res: Response<ApiResponse>) => {
  const browser = browserManager.getByProfile(req.params.name);
  if (!browser) {
    return res.status(404).json({ success: false, message: 'No session for this profile' });
  }
  res.json({ success: true, message: 'Browser found', data: browser });
});

/** DELETE /browsers/:id - Close a browser */
router.delete('/browsers/:id', async (req: Request, res: Response<ApiResponse>) => {
  const closed = await browserManager.close(req.params.id);
  if (!closed) {
    return res.status(404).json({ success: false, message: 'Browser not found' });
  }
  res.json({ success: true, message: 'Browser closed' });
});

// ==================== Pages ====================

/** POST /browsers/:browserId/pages - Create a new page */
router.post('/browsers/:browserId/pages', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const page = await browserManager.createPage(req.params.browserId);
    if (!page) {
      return res.status(404).json({ success: false, message: 'Browser not found' });
    }
    res.json({ success: true, message: 'Page created', data: page });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// ==================== Page Operations ====================

/**
 * POST /browsers/:browserId/pages/:pageId/goto
 * Navigate to URL
 */
router.post('/browsers/:browserId/pages/:pageId/goto', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { url, waitUntil = 'domcontentloaded' } = req.body as GotoRequest;
    const result = await browserManager.exec(
      req.params.browserId,
      req.params.pageId,
      async (page) => {
        await page.goto(url, { waitUntil });
        return { url: page.url(), title: await page.title() };
      }
    );
    res.json({ success: true, message: 'Navigated', data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
});

/**
 * POST /browsers/:browserId/pages/:pageId/click
 * Click an element
 */
router.post('/browsers/:browserId/pages/:pageId/click', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { selector } = req.body as ClickRequest;
    await browserManager.exec(req.params.browserId, req.params.pageId, page => page.click(selector));
    res.json({ success: true, message: 'Clicked' });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
});

/**
 * POST /browsers/:browserId/pages/:pageId/fill
 * Fill an input
 */
router.post('/browsers/:browserId/pages/:pageId/fill', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { selector, value } = req.body as FillRequest;
    await browserManager.exec(req.params.browserId, req.params.pageId, page => page.fill(selector, value));
    res.json({ success: true, message: 'Filled' });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
});

/**
 * POST /browsers/:browserId/pages/:pageId/type
 * Type text
 */
router.post('/browsers/:browserId/pages/:pageId/type', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { selector, text } = req.body as TypeRequest;
    await browserManager.exec(req.params.browserId, req.params.pageId, page => page.type(selector, text));
    res.json({ success: true, message: 'Typed' });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
});

/**
 * POST /browsers/:browserId/pages/:pageId/eval
 * Evaluate JavaScript
 */
router.post('/browsers/:browserId/pages/:pageId/eval', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { script } = req.body as EvalRequest;
    const result = await browserManager.exec(
      req.params.browserId,
      req.params.pageId,
      page => page.evaluate(script)
    );
    res.json({ success: true, message: 'Evaluated', data: { result } });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
});

/**
 * POST /browsers/:browserId/pages/:pageId/screenshot
 */
router.post('/browsers/:browserId/pages/:pageId/screenshot', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const buffer = await browserManager.exec(
      req.params.browserId,
      req.params.pageId,
      async (page) => {
        const buf = await page.screenshot();
        return buf.toString('base64');
      }
    );
    res.json({ success: true, message: 'Screenshot taken', data: { screenshot: buffer } });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
});

/**
 * GET /browsers/:browserId/pages/:pageId/content
 * Get page HTML
 */
router.get('/browsers/:browserId/pages/:pageId/content', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const html = await browserManager.exec(
      req.params.browserId,
      req.params.pageId,
      page => page.content()
    );
    res.json({ success: true, message: 'Content retrieved', data: { html } });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
});

/**
 * GET /browsers/:browserId/cookies
 * Get cookies
 */
router.get('/browsers/:browserId/cookies', async (req: Request, res: Response<ApiResponse>) => {
  try {
    // Find the context for this browser
    const context = (browserManager as any).findContext?.(req.params.browserId);
    if (!context) {
      return res.status(404).json({ success: false, message: 'Browser not found' });
    }

    const cookies = await context.cookies();
    res.json({ success: true, message: 'Cookies retrieved', data: { cookies } });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
});

export default router;
