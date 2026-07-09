import { Cookie } from "../models/request";

/**
 * In-memory cookie jar for the MCP server.
 *
 * This mirrors the extension's cookieJar (parse/match/header logic identical)
 * but drops the VS Code Memento persistence — an MCP session's cookies are
 * ephemeral and per-process, so an agent never inherits a human's session
 * cookies. Same public surface httpClient depends on: getCookieHeader + capture.
 */

let jar = new Map<string, Cookie[]>();

function extractDomain(urlStr: string): string {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return "";
  }
}

function parseCookieString(setCookieStr: string, requestUrl: string): Cookie | null {
  const parts = setCookieStr.split(";").map((s) => s.trim());
  if (parts.length === 0) return null;

  const [nameValue, ...attrs] = parts;
  const eqIdx = nameValue.indexOf("=");
  if (eqIdx === -1) return null;

  const name = nameValue.slice(0, eqIdx).trim();
  const value = nameValue.slice(eqIdx + 1).trim();
  if (!name) return null;

  const cookie: Cookie = {
    name,
    value,
    domain: extractDomain(requestUrl),
    path: "/",
    httpOnly: false,
    secure: false,
    enabled: true,
  };

  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower.startsWith("domain=")) {
      cookie.domain = attr.slice(7).trim().replace(/^\./, "");
    } else if (lower.startsWith("path=")) {
      cookie.path = attr.slice(5).trim();
    } else if (lower.startsWith("expires=")) {
      cookie.expires = attr.slice(8).trim();
    } else if (lower === "httponly") {
      cookie.httpOnly = true;
    } else if (lower === "secure") {
      cookie.secure = true;
    }
  }

  return cookie;
}

export function capture(rawSetCookies: string[], requestUrl: string): void {
  for (const raw of rawSetCookies) {
    const cookie = parseCookieString(raw, requestUrl);
    if (!cookie) continue;

    const domain = cookie.domain;
    const existing = jar.get(domain) ?? [];
    const idx = existing.findIndex((c) => c.name === cookie.name && c.path === cookie.path);
    if (idx >= 0) {
      existing[idx] = cookie;
    } else {
      existing.push(cookie);
    }
    jar.set(domain, existing);
  }
}

export function getCookieHeader(requestUrl: string): string | null {
  const domain = extractDomain(requestUrl);
  if (!domain) return null;

  const pairs: string[] = [];
  for (const [cookieDomain, cookies] of jar) {
    if (domain === cookieDomain || domain.endsWith("." + cookieDomain)) {
      for (const c of cookies) {
        if (!c.enabled) continue;
        if (c.expires && new Date(c.expires).getTime() < Date.now()) continue;
        pairs.push(`${c.name}=${c.value}`);
      }
    }
  }
  return pairs.length > 0 ? pairs.join("; ") : null;
}

export function getAll(): Cookie[] {
  const all: Cookie[] = [];
  for (const cookies of jar.values()) all.push(...cookies);
  return all;
}

export function clear(): void {
  jar.clear();
}
