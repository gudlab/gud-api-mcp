/**
 * Lightweight JSON path evaluator supporting dot notation and array indexing.
 * Example paths: "data.token", "users[0].name", "items[2].tags[0]"
 */
export function evaluateJsonPath(body: string, path: string): string | undefined {
  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch {
    return undefined;
  }

  // Split path into segments: "data.users[0].name" → ["data", "users", "0", "name"]
  const segments: string[] = [];
  for (const part of path.split(".")) {
    // Handle array notation: "users[0]" → ["users", "0"]
    const bracketMatch = part.match(/^([^[]+)(?:\[(\d+)\])?$/);
    if (bracketMatch) {
      if (bracketMatch[1]) segments.push(bracketMatch[1]);
      if (bracketMatch[2] !== undefined) segments.push(bracketMatch[2]);
    } else {
      segments.push(part);
    }
  }

  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }

  if (current === undefined || current === null) return undefined;
  if (typeof current === "object") return JSON.stringify(current);
  return String(current);
}
