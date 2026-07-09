// ─────────────────────────────────────────────────────────────────────────
// Shared with the Gud API editor extension, plus the additive `examples`
// field below. See src/core/README.md.
// ─────────────────────────────────────────────────────────────────────────
import { HttpRequest, TestAssertion, PreRequestAction, VariableExtraction } from "./request";
import { EnvVariable } from "./environment";

/**
 * A captured example response, attached to a request by the MCP server when
 * an agent runs it with saveExample. This is the "inherit" payload — the
 * human sees what the API actually returned when the agent tested it. The
 * extension renders these read-only (Phase 2). Optional and additive, so
 * files round-trip cleanly with extension versions that don't know about it.
 */
export interface ExampleResponse {
  label: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
  capturedAt: string;
}

export interface SavedRequest extends HttpRequest {
  name: string;
  tests?: TestAssertion[];
  preRequest?: PreRequestAction[];
  extractions?: VariableExtraction[];
  /** Captured example responses (max 5, oldest evicted). Written by the MCP server. */
  examples?: ExampleResponse[];
  /**
   * @deprecated Since 0.5.7 timings live in timingStore (globalState) so
   * sending a request never dirties the collection file. This field is
   * read as a display fallback for pre-0.5.7 files but never written.
   */
  timingHistory?: number[];
}

export interface Folder {
  id: string;
  name: string;
  requests: SavedRequest[];
  /**
   * Nested sub-folders. Added in 0.4.1 — files saved by earlier versions
   * don't have this field, so collectionStore.loadAll() normalizes missing
   * `folders` to `[]` on read (forward-compat, no migration required).
   */
  folders: Folder[];
}

export interface Collection {
  /** File format version, stamped on save since 0.5.7. Absent in older files. */
  schemaVersion?: number;
  id: string;
  name: string;
  folders: Folder[];
  requests: SavedRequest[];
  variables: EnvVariable[];
  createdAt: string;
  updatedAt: string;
  /** Whether this collection is shared with the user's team. */
  shared?: boolean;
  /** Permission level for team members: 'read' (view-only) or 'readwrite'. */
  permission?: "read" | "readwrite";
  /** Server-side user ID of the collection owner. */
  ownerId?: string;
  /** Server-side team ID if shared. */
  teamId?: string;
  /**
   * NOT persisted in the JSON file — the file's location IS its scope.
   *   - "global" (default): VS Code global storage, available across all workspaces
   *   - "workspace": stored in the current workspace's `.gud-api/collections/`
   *     and only visible when that workspace is open
   *
   * Workspace collections are NOT synced to the cloud — sync only covers
   * global collections.
   */
  source?: "global" | "workspace";
}
