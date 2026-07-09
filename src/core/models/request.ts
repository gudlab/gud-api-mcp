export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export type BodyType = "json" | "form" | "text" | "graphql" | "multipart" | "none";

export interface MultipartField {
  key: string;
  value: string;
  type: "text" | "file";
  fileName?: string;
}

export interface HistoryEntry {
  id: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string;
  bodyType: BodyType;
  auth: AuthConfig;
  status: number;
  statusText: string;
  timeMs: number;
  size: number;
  timestamp: string;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: string;
  httpOnly: boolean;
  secure: boolean;
  enabled: boolean;
}

export type AuthType = "none" | "bearer" | "basic" | "apikey";

export interface AuthConfig {
  type: AuthType;
  bearer?: { token: string };
  basic?: { username: string; password: string };
  apikey?: { key: string; value: string; addTo: "header" | "query" };
}

export const DEFAULT_AUTH: AuthConfig = { type: "none" };

export interface HttpRequest {
  id: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string;
  bodyType: BodyType;
  auth: AuthConfig;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
  size: number;
  /** The fully-resolved URL that was actually sent (after variable substitution). */
  resolvedUrl?: string;
}

export interface TestAssertion {
  id: string;
  source: "status" | "time" | "body" | "header" | "jsonpath";
  property?: string;
  operator: "eq" | "neq" | "contains" | "not_contains" | "gt" | "lt" | "exists";
  expected: string;
}

export interface PreRequestAction {
  id: string;
  variable: string;
  value: string;
}

export interface TestResult {
  assertionId: string;
  passed: boolean;
  actual: string;
  message: string;
}

export interface VariableExtraction {
  id: string;
  variable: string;
  source: "body_jsonpath" | "header" | "status" | "body_regex";
  expression: string;
}
