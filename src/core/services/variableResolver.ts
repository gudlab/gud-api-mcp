import { EnvVariable } from "../models/environment";

const VAR_PATTERN = /\{\{([^}]+)\}\}/g;
const MAX_PASSES = 5;

/**
 * Resolve {{variable}} placeholders in a string.
 * Resolution order (lowest → highest priority): global → collection → environment.
 * Supports variables referencing other variables via multi-pass resolution.
 * Only enabled variables are used.
 */
export function resolve(
  input: string,
  collectionVars: EnvVariable[],
  envVars: EnvVariable[],
  globalVars: EnvVariable[] = [],
): string {
  const lookup = buildLookup(globalVars, collectionVars, envVars);
  return multiPassResolve(input, lookup);
}

/**
 * Resolve variables in all parts of a request (url, headers, body).
 */
export function resolveRequest(
  url: string,
  headers: Record<string, string>,
  body: string,
  collectionVars: EnvVariable[],
  envVars: EnvVariable[],
  globalVars: EnvVariable[] = [],
): { url: string; headers: Record<string, string>; body: string } {
  const lookup = buildLookup(globalVars, collectionVars, envVars);

  const replacer = (input: string) => multiPassResolve(input, lookup);

  const resolvedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    resolvedHeaders[replacer(k)] = replacer(v);
  }

  return {
    url: replacer(url),
    headers: resolvedHeaders,
    body: replacer(body),
  };
}

/**
 * Multi-pass resolution: resolves variables that reference other variables.
 * e.g., root_url = "binance.com", url = "demo.{{root_url}}" → "demo.binance.com"
 * Runs up to MAX_PASSES to prevent infinite recursion.
 */
function multiPassResolve(input: string, lookup: Map<string, string>): string {
  let result = input;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = result.replace(VAR_PATTERN, (match, key: string) => {
      const trimmed = key.trim();
      return lookup.has(trimmed) ? lookup.get(trimmed)! : match;
    });
    if (next === result) break; // No more replacements
    result = next;
  }
  return result;
}

function buildLookup(
  globalVars: EnvVariable[],
  collectionVars: EnvVariable[],
  envVars: EnvVariable[],
): Map<string, string> {
  const map = new Map<string, string>();

  // Global vars first (lowest priority)
  for (const v of globalVars) {
    if (v.enabled && v.key.trim()) {
      map.set(v.key.trim(), v.value);
    }
  }

  // Collection vars override global
  for (const v of collectionVars) {
    if (v.enabled && v.key.trim()) {
      map.set(v.key.trim(), v.value);
    }
  }

  // Environment vars override all
  for (const v of envVars) {
    if (v.enabled && v.key.trim()) {
      map.set(v.key.trim(), v.value);
    }
  }

  return map;
}
