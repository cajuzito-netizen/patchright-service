/**
 * Example: Using the service from your machine
 * 
 * This runs on YOUR machine, connects to the SERVER.
 */

import { PatchrightClient, Browser, Page } from '../src/client.js';
import { writeFileSync } from 'fs';

// Connect to your server
const client = new PatchrightClient('http://your-server-ip:8000');

async function main() {
  console.log('=== Creating Browser ===');
  
  // Creates a Chrome context on the server
  // Profile data will be stored in profiles/my-account/
  const browser: Browser = await client.newBrowser('my-account');
  console.log(`Browser ID: ${browser.id}`);

  console.log('\n=== Creating Page ===');
  
  // Creates a new tab on the server
  const page: Page = await browser.newPage();
  console.log(`Page ID: ${page.id}`);

  console.log('\n=== Navigating ===');
  
  // Chrome on server navigates to the URL
  const result = await page.goto('https://httpbin.org/ip');
  console.log(`URL: ${result.url}`);

  console.log('\n=== Getting Content ===');
  
  // Get HTML from the page on server
  const html = await page.content();
  console.log(`HTML length: ${html.length}`);

  console.log('\n=== Running JavaScript ===');
  
  // Run JavaScript on the page
  const ip = await page.evaluate<{ origin: string }>('fetch("/ip").then(r => r.json())');
  console.log(`IP: ${ip.origin}`);

  console.log('\n=== Taking Screenshot ===');
  
  // Screenshot from server, returned as Buffer
  const screenshot = await page.screenshot();
  writeFileSync('screenshot.png', screenshot);
  console.log('Screenshot saved!');

  console.log('\n=== Getting Cookies ===');
  
  // Get cookies from server
  const cookies = await browser.cookies();
  console.log(`Cookies: ${cookies.length}`);

  console.log('\n=== Cleaning Up ===');
  
  await browser.close();
  console.log('Browser closed');

  console.log('\nDone!');
}

main().catch(console.error);
