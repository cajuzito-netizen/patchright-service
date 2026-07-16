# Patchright Service

Remote browser automation with stealth. Chrome runs on server, you control it from your machine.

## Setup

### Option 1: Direct Installation (no Docker)

```bash
# Clone
git clone https://github.com/cajuzito-netizen/patchright-service.git
cd patchright-service

# Install dependencies
pnpm install

# Install Chrome browser
pnpm run install-browsers

# Build TypeScript
pnpm run build

# Start server
pnpm start
```

### Option 2: Docker

```bash
docker-compose up -d
```

## System Requirements (for direct installation)

### Ubuntu/Debian
```bash
sudo apt-get update && sudo apt-get install -y \
    xvfb x11-utils libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libwayland-client0
```

### CentOS/RHEL
```bash
sudo yum install -y \
    xorg-x11-server-Xvfb libnss3 libatk-bridge2.0-0 \
    cups-libs libdrm libdbus-glib libXcomposite libXdamage \
    libXrandr mesa-libgbm pango cairo alsa-lib
```

### macOS
```bash
brew install xquartz
```

## Usage

```typescript
import { PatchrightClient } from 'patchright-client';

const client = new PatchrightClient('http://your-server:8000');

const browser = await client.newBrowser('my-account');
const page = await browser.newPage();

await page.goto('https://example.com');
await page.click('#button');
await page.fill('#input', 'hello');

const html = await page.content();
const screenshot = await page.screenshot();

await browser.close();
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/browsers` | Create browser |
| GET | `/browsers` | List browsers |
| DELETE | `/browsers/:id` | Close browser |
| POST | `/browsers/:id/pages` | Create page |
| POST | `/browsers/:id/pages/:pageId/goto` | Navigate |
| POST | `/browsers/:id/pages/:pageId/click` | Click |
| POST | `/browsers/:id/pages/:pageId/fill` | Fill input |
| POST | `/browsers/:id/pages/:pageId/eval` | Run JS |
| POST | `/browsers/:id/pages/:pageId/screenshot` | Screenshot |
| GET | `/browsers/:id/pages/:pageId/content` | Get HTML |
| GET | `/browsers/:id/cookies` | Get cookies |
