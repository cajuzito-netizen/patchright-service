/**
 * Patchright Client
 * 
 * Use this on YOUR machine to control browsers on the SERVER.
 * 
 * Usage:
 *   const client = new PatchrightClient('http://server:8000');
 *   
 *   const browser = await client.newBrowser('my-account');
 *   const page = await browser.newPage();
 *   
 *   await page.goto('https://example.com');
 *   await page.click('#button');
 *   const html = await page.content();
 */

// ==================== Page ====================

export class Page {
  constructor(
    private client: PatchrightClient,
    private browserId: string,
    private pageId: string
  ) {}

  get id() { return this.pageId; }

  async goto(url: string) {
    return this.client.post<{ url: string; title: string }>(
      `/browsers/${this.browserId}/pages/${this.pageId}/goto`,
      { url }
    );
  }

  async click(selector: string) {
    await this.client.post(
      `/browsers/${this.browserId}/pages/${this.pageId}/click`,
      { selector }
    );
  }

  async fill(selector: string, value: string) {
    await this.client.post(
      `/browsers/${this.browserId}/pages/${this.pageId}/fill`,
      { selector, value }
    );
  }

  async type(selector: string, text: string) {
    await this.client.post(
      `/browsers/${this.browserId}/pages/${this.pageId}/type`,
      { selector, text }
    );
  }

  async evaluate<T = unknown>(script: string): Promise<T> {
    const result = await this.client.post<{ result: T }>(
      `/browsers/${this.browserId}/pages/${this.pageId}/eval`,
      { script }
    );
    return result.result;
  }

  async screenshot(): Promise<Buffer> {
    const result = await this.client.post<{ screenshot: string }>(
      `/browsers/${this.browserId}/pages/${this.pageId}/screenshot`,
      {}
    );
    return Buffer.from(result.screenshot, 'base64');
  }

  async content(): Promise<string> {
    const result = await this.client.post<{ html: string }>(
      `/browsers/${this.browserId}/pages/${this.pageId}/content`,
      {}
    );
    return result.html;
  }

  async close() {
    // Page close not implemented in simple version
  }
}

// ==================== Browser ====================

export class Browser {
  constructor(
    private client: PatchrightClient,
    public readonly id: string,
    public readonly profileName: string
  ) {}

  async newPage(): Promise<Page> {
    const result = await this.client.post<{ id: string }>(
      `/browsers/${this.id}/pages`,
      {}
    );
    return new Page(this.client, this.id, result.id);
  }

  async cookies() {
    const result = await this.client.post<{ cookies: any[] }>(
      `/browsers/${this.id}/cookies`,
      {}
    );
    return result.cookies;
  }

  async close() {
    await this.client.delete(`/browsers/${this.id}`);
  }
}

// ==================== Client ====================

export class PatchrightClient {
  constructor(private baseUrl: string) {}

  async post<T = any>(path: string, body: any): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    return json.data;
  }

  async get<T = any>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    return json.data;
  }

  async delete(path: string) {
    await fetch(`${this.baseUrl}${path}`, { method: 'DELETE' });
  }

  /**
   * Create a new browser (Chrome context)
   * 
   * @param profileName - Name for this profile's data
   * @returns Browser you can create pages in
   */
  async newBrowser(profileName: string): Promise<Browser> {
    const result = await this.post<{ id: string }>(`/browsers`, { profileName });
    return new Browser(this, result.id, profileName);
  }

  /**
   * List all active browsers
   */
  async listBrowsers(): Promise<{ id: string; profileName: string }[]> {
    return this.get('/browsers');
  }
}

export default PatchrightClient;
