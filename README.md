# Patchright Service

Remote browser automation with stealth. Chrome runs on server, you control it from your machine.

## Architecture

```
Your Machine                           Server
┌─────────────────┐                   ┌─────────────────┐
│  Your Code      │                   │  Patchright      │
│                 │    HTTP           │  ┌─────────────┐ │
│  client.newBrowser()  ────────────► │  │ Chrome 1    │ │
│  page.goto(url)│                   │  │ (profile A) │ │
│  page.click()  │ ◄──────────── │  └─────────────┘ │
│                 │                   │  ┌─────────────┐ │
└─────────────────┘                   │  │ Chrome 2    │ │
                                      │  │ (profile B) │ │
                                      │  └─────────────┘ │
                                      │                   │
                                      │  profiles/        │
                                      │  ├── A/ (cookies) │
                                      │  └── B/ (cookies) │
                                      └─────────────────┘
```

## Setup

### Server (where Chrome runs)

```bash
# Install
npm install
npx patchright install chrome
npm run build

# Run
npm start

# Or Docker
docker-compose up -d
```

### Client (your machine)

```bash
npm install patchright-service  # or copy src/client.ts
```

## Usage

```typescript
import { PatchrightClient } from './src/client.js';

// Connect to your server
const client = new PatchrightClient('http://your-server:8000');

// Create a browser (creates Chrome context on server)
const browser = await client.newBrowser('my-account');

// Create a page (creates tab on server)
const page = await browser.newPage();

// Use it like Playwright
await page.goto('https://example.com');
await page.click('#login');
await page.fill('#user', 'admin');
await page.fill('#pass', '1234');

// Get data
const html = await page.content();
const screenshot = await page.screenshot();
const cookies = await browser.cookies();

// Cleanup
await browser.close();
```

## How It Works

1. **You call** `client.newBrowser('my-account')`
2. **Server creates** a Chrome context with:
   - Persistent storage in `profiles/my-account/`
   - Stealth patches (Patchright)
   - Xvfb virtual display
3. **Server returns** a browser ID
4. **You use** the browser ID to create pages and interact
5. **Cookies persist** on server in `profiles/my-account/`

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/browsers` | Create browser |
| GET | `/browsers` | List browsers |
| DELETE | `/browsers/:id` | Close browser |
| POST | `/browsers/:id/pages` | Create page |
| POST | `/browsers/:id/pages/:pageId/goto` | Navigate |
| POST | `/browsers/:id/pages/:pageId/click` | Click element |
| POST | `/browsers/:id/pages/:pageId/fill` | Fill input |
| POST | `/browsers/:id/pages/:pageId/eval` | Run JS |
| POST | `/browsers/:id/pages/:pageId/screenshot` | Screenshot |
| GET | `/browsers/:id/pages/:pageId/content` | Get HTML |
| GET | `/browsers/:id/cookies` | Get cookies |

## Concurrency

Multiple browsers run in parallel on the server:

```typescript
// These all run concurrently
const [b1, b2, b3] = await Promise.all([
  client.newBrowser('user1'),
  client.newBrowser('user2'),
  client.newBrowser('user3'),
]);

// Each browser is isolated
await Promise.all([
  b1.newPage().then(p => p.goto('https://a.com')),
  b2.newPage().then(p => p.goto('https://b.com')),
  b3.newPage().then(p => p.goto('https://c.com')),
]);
```

## Data Storage

```
profiles/
├── my-account/
│   └── Default/           ← Chrome user data
│       ├── Cookies        ← Saved cookies
│       ├── Local Storage/ ← localStorage
│       ├── IndexedDB/     ← IndexedDB
│       └── Cache/         ← HTTP cache
```

Cookies and storage **persist on server**. Next time you create a browser with the same profile name, you'll have the same session.
