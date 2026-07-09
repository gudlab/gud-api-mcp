import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const AC = path.resolve(here, "../../api-client/src");
const CORE = path.resolve(here, "../src/core");

/**
 * These core files are mirrored verbatim from the extension. If someone edits
 * one in api-client without mirroring it here, this test fails loudly — the MCP
 * server would otherwise silently drift from the extension's request execution,
 * variable resolution, or test semantics.
 *
 * collection.ts and cookieJar.ts are intentionally divergent (added examples /
 * in-memory reimplementation) and are excluded.
 */
const IDENTICAL = [
  ["models/request.ts", "models/request.ts"],
  ["models/environment.ts", "models/environment.ts"],
  ["services/variableResolver.ts", "services/variableResolver.ts"],
  ["services/testRunner.ts", "services/testRunner.ts"],
  ["services/extractionRunner.ts", "services/extractionRunner.ts"],
  ["services/jsonPath.ts", "services/jsonPath.ts"],
  ["services/httpClient.ts", "services/httpClient.ts"],
];

describe("core parity with the extension", () => {
  for (const [acPath, corePath] of IDENTICAL) {
    it(`${corePath} matches api-client`, () => {
      const source = fs.readFileSync(path.join(AC, acPath), "utf-8");
      const mirror = fs.readFileSync(path.join(CORE, corePath), "utf-8");
      expect(mirror).toBe(source);
    });
  }
});
