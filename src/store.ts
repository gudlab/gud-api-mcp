import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import { Collection, Folder, SavedRequest } from "./core/models/collection";
import { Environment } from "./core/models/environment";

/**
 * Plain-Node file store for Gud API collections and environments.
 *
 * Reads and writes exactly the same `.gud-api/` layout and JSON format as the
 * VS Code extension (collectionStore.ts @ 0.5.7): slug filenames, canonical
 * key order, `schemaVersion`, trailing newline, `timingHistory` stripped. That
 * byte-compatibility is the whole point — an agent writes a collection here and
 * the human opens it in their editor with no conversion.
 *
 * The MCP server targets WORKSPACE scope: files live under the project passed
 * via --project. Workspace collections are never cloud-synced, so agent output
 * stays local and git-committable.
 */

const COLLECTION_DIR = ".gud-api/collections";
const ENV_DIR = ".gud-api/environments";

const COLLECTION_KEY_ORDER = ["schemaVersion", "id", "name", "variables", "folders", "requests", "createdAt", "updatedAt"];
const REQUEST_KEY_ORDER = ["id", "name", "method", "url", "headers", "body", "bodyType", "auth", "tests", "preRequest", "extractions", "examples"];
const FOLDER_KEY_ORDER = ["id", "name", "requests", "folders"];
const ENV_KEY_ORDER = ["schemaVersion", "id", "name", "variables", "createdAt", "updatedAt"];

// ── serialization (mirrors collectionStore.serializeForDisk) ──

function orderKeys(obj: Record<string, unknown>, priority: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of priority) if (obj[k] !== undefined) out[k] = obj[k];
  for (const k of Object.keys(obj).sort()) if (!(k in out) && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function orderRequest(req: SavedRequest): Record<string, unknown> {
  const { timingHistory: _t, ...rest } = req;
  return orderKeys(rest as unknown as Record<string, unknown>, REQUEST_KEY_ORDER);
}

function orderFolder(folder: Folder): Record<string, unknown> {
  const ordered = orderKeys(folder as unknown as Record<string, unknown>, FOLDER_KEY_ORDER);
  ordered.requests = folder.requests.map(orderRequest);
  ordered.folders = folder.folders.map(orderFolder);
  return ordered;
}

function serializeCollection(collection: Collection): string {
  const { source: _s, ownerId: _o, teamId: _tid, shared: _sh, permission: _p, ...persisted } =
    collection as Collection & Record<string, unknown>;
  const ordered = orderKeys({ schemaVersion: 1, ...persisted }, COLLECTION_KEY_ORDER);
  ordered.requests = collection.requests.map(orderRequest);
  ordered.folders = collection.folders.map(orderFolder);
  return JSON.stringify(ordered, null, 2) + "\n";
}

function serializeEnvironment(env: Environment): string {
  const ordered = orderKeys({ schemaVersion: 1, ...env }, ENV_KEY_ORDER);
  return JSON.stringify(ordered, null, 2) + "\n";
}

// ── filenames ──

function slugify(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "collection"
  );
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// ── normalization (forward-compat with older files) ──

function normalizeFolders(folders: Folder[] | undefined): Folder[] {
  if (!folders) return [];
  for (const f of folders) {
    if (!Array.isArray(f.folders)) f.folders = [];
    if (!Array.isArray(f.requests)) f.requests = [];
    normalizeFolders(f.folders);
  }
  return folders;
}

// ── the store ──

export class GudApiStore {
  /** id → on-disk filename, learned on read so saves land on the same file. */
  private collectionFiles = new Map<string, string>();
  private envFiles = new Map<string, string>();

  constructor(private readonly projectRoot: string) {}

  private gudApiDir(): string {
    return path.join(this.projectRoot, ".gud-api");
  }
  private colDir(): string {
    return path.join(this.projectRoot, COLLECTION_DIR);
  }
  private envDir(): string {
    return path.join(this.projectRoot, ENV_DIR);
  }

  async loadCollections(): Promise<Collection[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.colDir());
    } catch {
      return [];
    }
    const out: Collection[] = [];
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      try {
        const text = await fs.readFile(path.join(this.colDir(), name), "utf-8");
        const parsed = JSON.parse(text) as Collection;
        parsed.folders = normalizeFolders(parsed.folders);
        if (!Array.isArray(parsed.requests)) parsed.requests = [];
        if (!Array.isArray(parsed.variables)) parsed.variables = [];
        parsed.source = "workspace";
        this.collectionFiles.set(parsed.id, name);
        out.push(parsed);
      } catch {
        // skip unreadable/malformed file
      }
    }
    return out;
  }

  async findCollection(nameOrId: string): Promise<Collection | undefined> {
    const all = await this.loadCollections();
    return all.find((c) => c.id === nameOrId) ?? all.find((c) => c.name === nameOrId);
  }

  private async resolveCollectionFilename(c: Collection): Promise<string> {
    const registered = this.collectionFiles.get(c.id);
    if (registered) return registered;
    const legacy = `${c.id}.json`;
    if (await fileExists(path.join(this.colDir(), legacy))) {
      this.collectionFiles.set(c.id, legacy);
      return legacy;
    }
    let candidate = `${slugify(c.name)}.json`;
    if (await fileExists(path.join(this.colDir(), candidate))) {
      candidate = `${slugify(c.name)}-${c.id.slice(0, 8)}.json`;
    }
    this.collectionFiles.set(c.id, candidate);
    return candidate;
  }

  /**
   * Write a `.gud-api/README.md` the first time we touch the folder. This is
   * how a human who has NO Gud API extension installed learns that the files
   * an agent just created aren't broken — they're collections, and here's how
   * to view them. It's the durable, self-explanatory fallback: it shows in the
   * file tree, in git, and any editor renders it. Only written if absent, so it
   * never clobbers a customized one.
   */
  private async ensureReadme(): Promise<void> {
    const readmePath = path.join(this.gudApiDir(), "README.md");
    if (await fileExists(readmePath)) return;
    await fs.mkdir(this.gudApiDir(), { recursive: true });
    await fs.writeFile(readmePath, GUD_API_README, "utf-8");
  }

  async saveCollection(c: Collection): Promise<void> {
    await fs.mkdir(this.colDir(), { recursive: true });
    await this.ensureReadme();
    c.updatedAt = new Date().toISOString();
    const filename = await this.resolveCollectionFilename(c);
    await fs.writeFile(path.join(this.colDir(), filename), serializeCollection(c), "utf-8");
  }

  async createCollection(name: string, variables: Environment["variables"] = []): Promise<Collection> {
    const now = new Date().toISOString();
    const c: Collection = {
      schemaVersion: 1,
      id: randomUUID(),
      name,
      folders: [],
      requests: [],
      variables,
      createdAt: now,
      updatedAt: now,
      source: "workspace",
    };
    await this.saveCollection(c);
    return c;
  }

  async loadEnvironments(): Promise<Environment[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.envDir());
    } catch {
      return [];
    }
    const out: Environment[] = [];
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      try {
        const text = await fs.readFile(path.join(this.envDir(), name), "utf-8");
        const parsed = JSON.parse(text) as Environment;
        if (!Array.isArray(parsed.variables)) parsed.variables = [];
        this.envFiles.set(parsed.id, name);
        out.push(parsed);
      } catch {
        // skip
      }
    }
    return out;
  }

  private async resolveEnvFilename(e: Environment): Promise<string> {
    const registered = this.envFiles.get(e.id);
    if (registered) return registered;
    const legacy = `${e.id}.json`;
    if (await fileExists(path.join(this.envDir(), legacy))) {
      this.envFiles.set(e.id, legacy);
      return legacy;
    }
    let candidate = `${slugify(e.name)}.json`;
    if (await fileExists(path.join(this.envDir(), candidate))) {
      candidate = `${slugify(e.name)}-${e.id.slice(0, 8)}.json`;
    }
    this.envFiles.set(e.id, candidate);
    return candidate;
  }

  async saveEnvironment(e: Environment): Promise<void> {
    await fs.mkdir(this.envDir(), { recursive: true });
    await this.ensureReadme();
    e.updatedAt = new Date().toISOString();
    const filename = await this.resolveEnvFilename(e);
    await fs.writeFile(path.join(this.envDir(), filename), serializeEnvironment(e), "utf-8");
  }

  async upsertEnvironment(name: string, variables: Environment["variables"]): Promise<Environment> {
    const all = await this.loadEnvironments();
    const existing = all.find((e) => e.name === name);
    const now = new Date().toISOString();
    const env: Environment = existing
      ? { ...existing, variables }
      : { id: randomUUID(), name, variables, createdAt: now, updatedAt: now };
    await this.saveEnvironment(env);
    return env;
  }
}

/**
 * Dropped into `.gud-api/README.md` on first write. The one job: make sure a
 * human who doesn't have the Gud API extension realizes these files aren't
 * broken, and knows how to view them.
 */
const GUD_API_README = `# Gud API collections

These files were created by an AI agent through the **Gud API MCP server**
(\`@gudlab/gud-api-mcp\`). They are standard Gud API collections — plain JSON, safe to
read and to commit to git. **Nothing is broken** if you don't see a UI yet: you
just need the Gud API extension to view and run them.

## View & run them

Install the **Gud API** extension in your editor, then open the Gud API view in
the activity bar:

- **VS Code** — https://marketplace.visualstudio.com/items?itemName=gudlab.gud-api
- **Cursor, Windsurf, VSCodium, Antigravity, and other VS Code-compatible
  editors** — https://open-vsx.org/extension/gudlab/gud-api (usually the default
  extension source in those editors)

Once installed, your collections appear in the **Gud API sidebar**. Click any
request to open it and press **Send** to run it. Responses the agent captured
show on the request's **Examples** tab.

## Don't want the extension?

These are readable JSON files under \`collections/\` and \`environments/\`. You can
inspect them directly, or feed a request to any HTTP client — but the extension
is what makes them clickable and runnable.

## Learn more

https://gudapi-docs.gudlab.org/guide/ai-agents

_This file was generated automatically and is safe to delete or edit — it won't
be recreated unless it's missing._
`;

// Exposed for tests.
export const _internal = { serializeCollection, serializeEnvironment, slugify, GUD_API_README };
