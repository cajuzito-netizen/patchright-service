/**
 * Types for Patchright Service
 */

export interface Config {
  host: string;
  port: number;
  profilesDir: string;
  displayNum: string;
  screenSize: string;
}

// ==================== Profile ====================

export interface Profile {
  name: string;
  proxy: string | null;
  createdAt: string;
  lastUsed: string | null;
}

// ==================== Browser (Context) ====================

export interface Browser {
  id: string;
  profileName: string;
  createdAt: string;
  lastActivity: string;
}

// ==================== Page ====================

export interface PageInfo {
  id: string;
  url: string;
  title: string;
}

// ==================== Requests ====================

export interface CreateProfileRequest {
  name: string;
  proxy?: string;
}

export interface CreateBrowserRequest {
  profileName: string;
}

export interface GotoRequest {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface ClickRequest {
  selector: string;
}

export interface FillRequest {
  selector: string;
  value: string;
}

export interface TypeRequest {
  selector: string;
  text: string;
}

export interface EvalRequest {
  script: string;
}

// ==================== Responses ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}
