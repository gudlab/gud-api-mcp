#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "crypto";
import { z } from "zod";

import { GudApiStore } from "./store.js";
import { upsertRequest, deleteRequest, findRequestDeep, addExample, countRequests, folderPaths } from "./tree.js";
import { maskSecrets, truncateBody } from "./util.js";
import * as httpClient from "./core/services/httpClient.js";
import { runAssertions } from "./core/services/testRunner.js";
import type { SavedRequest, Collection } from "./core/models/collection.js";
import type { HttpMethod, BodyType, AuthConfig, MultipartField } from "./core/models/request.js";
import type { EnvVariable } from "./core/models/environment.js";

// ── CLI args ──
function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const PROJECT_ROOT = argValue("--project", process.cwd());
const BODY_CAP = parseInt(argValue("--body-cap", "4096"), 10) || 4096;

const store = new GudApiStore(PROJECT_ROOT);
/** Session-scoped active environment name (set via upsert_environment / get_active_environment). */
let activeEnvName: string | null = null;

// ── zod shapes ──
const requestShape = z.object({
  name: z.string().describe("Human-readable request name; also the upsert match key within a collection."),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
  url: z.string().describe("Request URL. May contain {{variable}} placeholders resolved from the environment and collection."),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  bodyType: z.enum(["json", "form", "text", "graphql", "multipart", "none"]).optional(),
  auth: z
    .object({
      type: z.enum(["none", "bearer", "basic", "apikey"]),
      bearer: z.object({ token: z.string() }).optional(),
      basic: z.object({ username: z.string(), password: z.string() }).optional(),
      apikey: z.object({ key: z.string(), value: z.string(), addTo: z.enum(["header", "query"]) }).optional(),
    })
    .optional(),
  tests: z
    .array(
      z.object({
        id: z.string().optional(),
        source: z.enum(["status", "time", "body", "header", "jsonpath"]),
        property: z.string().optional(),
        operator: z.enum(["eq", "neq", "contains", "not_contains", "gt", "lt", "exists"]),
        expected: z.string(),
      }),
    )
    .optional()
    .describe("Assertions run automatically after send_request."),
});

function toSavedRequest(input: z.infer<typeof requestShape>): SavedRequest {
  // Always carry an id so the value satisfies HttpRequest for execute(). For
  // upsert, tree.upsertRequest matches by name and preserves the existing id,
  // so this generated id only sticks for genuinely new requests.
  return {
    id: randomUUID(),
    name: input.name,
    method: input.method as HttpMethod,
    url: input.url,
    headers: input.headers ?? {},
    body: input.body ?? "",
    bodyType: (input.bodyType as BodyType) ?? "none",
    auth: (input.auth as AuthConfig) ?? { type: "none" },
    tests: input.tests?.map((t) => ({ ...t, id: t.id ?? randomUUID() })) as SavedRequest["tests"],
  };
}

function ok(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

// ── build server ──
// __GUD_MCP_VERSION__ is replaced at build time (esbuild define) with the
// package.json version. Fallback keeps `tsc`/tests happy where it's undefined.
declare const __GUD_MCP_VERSION__: string | undefined;
const VERSION = typeof __GUD_MCP_VERSION__ !== "undefined" ? __GUD_MCP_VERSION__ : "0.0.0-dev";
const server = new McpServer({ name: "gud-api", version: VERSION });

server.tool(
  "list_collections",
  "List all Gud API collections in the project's .gud-api folder, with request counts and folder names.",
  {},
  async () => {
    const cols = await store.loadCollections();
    return ok(
      cols.map((c) => ({
        id: c.id,
        name: c.name,
        requestCount: countRequests(c),
        folders: folderPaths(c),
        variables: c.variables.map((v) => v.key),
      })),
    );
  },
);

server.tool(
  "get_collection",
  "Get the full contents of one collection: folders, requests (with method/url/headers/body), and variables. Example response bodies are summarized.",
  { collection: z.string().describe("Collection id or name.") },
  async ({ collection }) => {
    const c = await store.findCollection(collection);
    if (!c) return fail(`Collection not found: ${collection}`);
    const summarizeReq = (r: SavedRequest) => ({
      id: r.id,
      name: r.name,
      method: r.method,
      url: r.url,
      headers: r.headers,
      bodyType: r.bodyType,
      hasBody: !!r.body,
      hasTests: !!r.tests?.length,
      examples: (r.examples ?? []).map((e) => ({ label: e.label, status: e.status, capturedAt: e.capturedAt })),
    });
    const summarizeFolder = (f: Collection["folders"][number]): unknown => ({
      name: f.name,
      requests: f.requests.map(summarizeReq),
      folders: f.folders.map(summarizeFolder),
    });
    return ok({
      id: c.id,
      name: c.name,
      variables: c.variables,
      requests: c.requests.map(summarizeReq),
      folders: c.folders.map(summarizeFolder),
    });
  },
);

server.tool(
  "create_collection",
  "Create a new collection in the project (.gud-api/collections). Returns its id.",
  {
    name: z.string(),
    variables: z.array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() })).optional(),
  },
  async ({ name, variables }) => {
    const vars: EnvVariable[] = (variables ?? []).map((v) => ({ key: v.key, value: v.value, enabled: v.enabled ?? true }));
    const c = await store.createCollection(name, vars);
    return ok({
      id: c.id,
      name: c.name,
      path: `.gud-api/collections`,
      // Surfaced so the agent can tell the human how to view the result — they
      // may not have the Gud API extension yet and would otherwise think nothing
      // happened. A .gud-api/README.md with the same guidance is also written.
      viewHint:
        "To view and run this, install the Gud API extension (VS Code Marketplace, or Open VSX for Cursor/Windsurf/VSCodium). See .gud-api/README.md.",
    });
  },
);

server.tool(
  "upsert_request",
  "Create or update a request inside a collection (matched by name). The collection is created if it doesn't exist. Optionally nest it under a folder path.",
  {
    collection: z.string().describe("Collection name or id. Created if missing."),
    folderPath: z.array(z.string()).optional().describe('Folder path, e.g. ["Auth","JWT"]. Created as needed.'),
    request: requestShape,
  },
  async ({ collection, folderPath, request }) => {
    let c = await store.findCollection(collection);
    if (!c) c = await store.createCollection(collection);
    const { requestId, created } = upsertRequest(c, folderPath ?? [], toSavedRequest(request));
    await store.saveCollection(c);
    return ok({ requestId, created, collection: c.name });
  },
);

server.tool(
  "send_request",
  "Execute a request and return status, timing, headers, and a (truncated) body. Resolves {{variables}} from the active environment and the request's collection. Optionally capture the response as a saved example.",
  {
    collection: z.string().optional().describe("Collection name/id when sending a saved request."),
    requestName: z.string().optional().describe("Saved request name or id within the collection."),
    request: requestShape.optional().describe("Inline request definition (alternative to collection+requestName)."),
    saveExample: z
      .union([z.boolean(), z.string()])
      .optional()
      .describe("When set, capture the response as an example on the saved request. Pass a string to label it."),
  },
  async ({ collection, requestName, request, saveExample }) => {
    let def: SavedRequest;
    let col: Collection | undefined;
    let saved: SavedRequest | undefined;

    if (request) {
      def = toSavedRequest(request);
    } else if (collection && requestName) {
      col = await store.findCollection(collection);
      if (!col) return fail(`Collection not found: ${collection}`);
      const hit = findRequestDeep(col, requestName);
      if (!hit) return fail(`Request not found in ${collection}: ${requestName}`);
      def = hit.request;
      saved = hit.request;
    } else {
      return fail("Provide either `request`, or `collection` + `requestName`.");
    }

    const collectionVars: EnvVariable[] = col?.variables ?? [];
    const envs = await store.loadEnvironments();
    const activeEnv = activeEnvName ? envs.find((e) => e.name === activeEnvName) : undefined;
    const envVars: EnvVariable[] = activeEnv?.variables ?? [];

    let multipart: MultipartField[] | undefined;
    if (def.bodyType === "multipart" && def.body) {
      try {
        multipart = JSON.parse(def.body);
      } catch {
        /* ignore */
      }
    }

    let response;
    try {
      response = await httpClient.execute(def, collectionVars, envVars, multipart, []);
    } catch (err) {
      return fail(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const testResults = def.tests?.length ? runAssertions(response, def.tests) : undefined;
    const { body, truncated, fullLength } = truncateBody(response.body, BODY_CAP);

    // Capture example on the saved request, if requested and this is a saved request
    if (saveExample && saved && col) {
      addExample(saved, {
        label: typeof saveExample === "string" ? saveExample : `${response.status} ${response.statusText}`.trim(),
        status: response.status,
        headers: response.headers,
        body: response.body.slice(0, 16 * 1024),
        timeMs: response.timeMs,
        capturedAt: new Date().toISOString(),
      });
      await store.saveCollection(col);
    }

    return ok({
      status: response.status,
      statusText: response.statusText,
      timeMs: response.timeMs,
      size: response.size,
      resolvedUrl: response.resolvedUrl,
      headers: response.headers,
      body,
      bodyTruncated: truncated,
      bodyFullLength: fullLength,
      testResults: testResults?.map((t) => ({ passed: t.passed, message: t.message })),
      exampleSaved: !!(saveExample && saved),
    });
  },
);

server.tool(
  "delete_request",
  "Delete a saved request from a collection by id or name.",
  { collection: z.string(), request: z.string().describe("Request id or name.") },
  async ({ collection, request }) => {
    const c = await store.findCollection(collection);
    if (!c) return fail(`Collection not found: ${collection}`);
    const removed = deleteRequest(c, request);
    if (!removed) return fail(`Request not found: ${request}`);
    await store.saveCollection(c);
    return ok({ deleted: true });
  },
);

server.tool(
  "upsert_environment",
  "Create or update an environment (a named set of variables, e.g. base_url and tokens). Matched by name. Optionally set it active for subsequent send_request calls.",
  {
    name: z.string(),
    variables: z.array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() })),
    setActive: z.boolean().optional(),
  },
  async ({ name, variables, setActive }) => {
    const vars: EnvVariable[] = variables.map((v) => ({ key: v.key, value: v.value, enabled: v.enabled ?? true }));
    const env = await store.upsertEnvironment(name, vars);
    if (setActive) activeEnvName = env.name;
    return ok({ id: env.id, name: env.name, active: activeEnvName === env.name, variableCount: vars.length });
  },
);

server.tool(
  "get_active_environment",
  "Return the active environment's variables. Secret-looking values (token/key/secret/password/…) are masked — send_request still resolves the real values server-side.",
  {},
  async () => {
    if (!activeEnvName) return ok({ active: null, note: "No active environment. Use upsert_environment with setActive: true." });
    const envs = await store.loadEnvironments();
    const env = envs.find((e) => e.name === activeEnvName);
    if (!env) return ok({ active: null, note: `Active environment '${activeEnvName}' no longer exists.` });
    return ok({ active: env.name, variables: maskSecrets(env.variables) });
  },
);

// ── run ──
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Announce readiness on stderr (stdout is the MCP channel). If a human ran
  // this directly in a terminal, the process now blocks reading stdin — which
  // looks like a hang. Say so, so nobody thinks it's broken. When an MCP client
  // (Claude Code, Cursor, …) spawns it, stdin is the client and this is silent.
  process.stderr.write(`[gud-api mcp] ready — project: ${PROJECT_ROOT}\n`);
  if (process.stdin.isTTY) {
    process.stderr.write(
      `[gud-api mcp] This is a Model Context Protocol server, not an interactive CLI.\n` +
        `[gud-api mcp] It is now waiting for an MCP client to talk to it over stdin — nothing is broken.\n` +
        `[gud-api mcp] Configure it in Claude Code / Cursor / Windsurf instead of running it by hand:\n` +
        `[gud-api mcp]   { "mcpServers": { "gud-api": { "command": "npx", "args": ["-y", "@gudlab/gud-api-mcp", "--project", "."] } } }\n` +
        `[gud-api mcp] Docs: https://gudapi.gudlab.org/docs/ai-agents  ·  Press Ctrl+C to exit.\n`,
    );
  }
}

main().catch((err) => {
  process.stderr.write(`[gud-api mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
