import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { Config } from './types.js';

const BASE_DIR = resolve(import.meta.dirname, '..');

const config: Config = {
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '8000', 10),
  profilesDir: resolve(BASE_DIR, 'profiles'),
  displayNum: process.env.DISPLAY || ':99',
  screenSize: process.env.SCREEN_SIZE || '1920x1080x24',
};

mkdirSync(config.profilesDir, { recursive: true });

export default config;
