/**
 * Patchright Service
 * 
 * Remote browser automation with stealth.
 * Chrome runs on server, you control it via HTTP.
 */

import express from 'express';
import cors from 'cors';
import { execSync, spawn, ChildProcess } from 'child_process';
import config from './config.js';
import routes from './routes.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(routes);

// Root endpoint with usage info
app.get('/', (req, res) => {
  res.json({
    name: 'Patchright Service',
    usage: {
      '1. Create browser': 'POST /browsers { profileName: "my-account" }',
      '2. Create page': 'POST /browsers/:id/pages',
      '3. Navigate': 'POST /browsers/:id/pages/:pageId/goto { url }',
      '4. Interact': 'POST /browsers/:id/pages/:pageId/click { selector }',
      '5. Get data': 'GET /browsers/:id/pages/:pageId/content',
    },
    endpoints: {
      browsers: '/browsers',
      cookies: '/browsers/:id/cookies',
    },
  });
});

// Start Xvfb
let xvfb: ChildProcess | null = null;

function startXvfb() {
  try { execSync(`pkill -f "Xvfb ${config.displayNum}"`, { stdio: 'ignore' }); } catch {}
  
  xvfb = spawn('Xvfb', [
    config.displayNum,
    '-screen', '0', config.screenSize,
    '+extension', 'GLX',
  ], { stdio: 'ignore', detached: true });
  
  xvfb.unref();
  process.env.DISPLAY = config.displayNum;
  console.log(`✓ Xvfb started on ${config.displayNum}`);
}

async function shutdown() {
  console.log('\nShutting down...');
  if (xvfb) xvfb.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  startXvfb();
  await new Promise(r => setTimeout(r, 1000));

  app.listen(config.port, config.host, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║       Patchright Service                      ║
╠═══════════════════════════════════════════════╣
║  Server: http://${config.host}:${config.port}         ║
║  Display: ${config.displayNum} (${config.screenSize})   ║
╚═══════════════════════════════════════════════╝
    `);
  });
}

main().catch(console.error);
