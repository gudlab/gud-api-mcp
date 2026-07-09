import { randomUUID } from "crypto";
import { Collection, Folder, SavedRequest, ExampleResponse } from "./core/models/collection";

const MAX_EXAMPLES = 5;

/**
 * Walk (creating as needed) a folder path like ["Auth", "JWT"] and return the
 * innermost folder. An empty path returns null (meaning collection root).
 */
export function ensureFolderPath(collection: Collection, folderPath: string[]): Folder | null {
  if (!folderPath || folderPath.length === 0) return null;
  let list = collection.folders;
  let current: Folder | null = null;
  for (const name of folderPath) {
    let next = list.find((f) => f.name === name);
    if (!next) {
      next = { id: randomUUID(), name, requests: [], folders: [] };
      list.push(next);
    }
    current = next;
    list = next.folders;
  }
  return current;
}

/** Locate a request by id or name anywhere in the tree. */
export function findRequestDeep(
  collection: Collection,
  idOrName: string,
): { request: SavedRequest; container: SavedRequest[] } | null {
  const scan = (list: SavedRequest[]): { request: SavedRequest; container: SavedRequest[] } | null => {
    const byId = list.find((r) => r.id === idOrName);
    if (byId) return { request: byId, container: list };
    const byName = list.find((r) => r.name === idOrName);
    if (byName) return { request: byName, container: list };
    return null;
  };
  const rootHit = scan(collection.requests);
  if (rootHit) return rootHit;
  const walk = (folders: Folder[]): { request: SavedRequest; container: SavedRequest[] } | null => {
    for (const f of folders) {
      const hit = scan(f.requests);
      if (hit) return hit;
      const nested = walk(f.folders);
      if (nested) return nested;
    }
    return null;
  };
  return walk(collection.folders);
}

/**
 * Upsert a request into a collection at the given folder path. Matches by
 * name within the target container (agents re-register the same endpoint as
 * they iterate). Preserves the existing id and captured examples on update.
 * Returns the resolved request id and whether it was newly created.
 */
export function upsertRequest(
  collection: Collection,
  folderPath: string[],
  incoming: Omit<SavedRequest, "id"> & { id?: string },
): { requestId: string; created: boolean } {
  const folder = ensureFolderPath(collection, folderPath);
  const container = folder ? folder.requests : collection.requests;

  const existing =
    (incoming.id && container.find((r) => r.id === incoming.id)) ||
    container.find((r) => r.name === incoming.name);

  if (existing) {
    // Preserve id + examples; overwrite the rest of the definition
    const preservedExamples = existing.examples;
    Object.assign(existing, incoming, { id: existing.id });
    if (preservedExamples && !incoming.examples) existing.examples = preservedExamples;
    return { requestId: existing.id, created: false };
  }

  const req: SavedRequest = { ...incoming, id: incoming.id ?? randomUUID() } as SavedRequest;
  container.push(req);
  return { requestId: req.id, created: true };
}

/** Delete a request by id or name. Returns true if something was removed. */
export function deleteRequest(collection: Collection, idOrName: string): boolean {
  const hit = findRequestDeep(collection, idOrName);
  if (!hit) return false;
  const idx = hit.container.indexOf(hit.request);
  if (idx >= 0) {
    hit.container.splice(idx, 1);
    return true;
  }
  return false;
}

/** Append a captured example, evicting the oldest beyond MAX_EXAMPLES. */
export function addExample(request: SavedRequest, example: ExampleResponse): void {
  const list = request.examples ?? [];
  list.push(example);
  request.examples = list.slice(-MAX_EXAMPLES);
}

/** Count requests across the whole tree. */
export function countRequests(collection: Collection): number {
  let n = collection.requests.length;
  const walk = (folders: Folder[]) => {
    for (const f of folders) {
      n += f.requests.length;
      walk(f.folders);
    }
  };
  walk(collection.folders);
  return n;
}

/** Flat list of folder path labels, e.g. ["Auth", "Auth / JWT"]. */
export function folderPaths(collection: Collection): string[] {
  const out: string[] = [];
  const walk = (folders: Folder[], prefix: string[]) => {
    for (const f of folders) {
      const p = [...prefix, f.name];
      out.push(p.join(" / "));
      walk(f.folders, p);
    }
  };
  walk(collection.folders, []);
  return out;
}
