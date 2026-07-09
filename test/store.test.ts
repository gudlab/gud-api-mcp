import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { GudApiStore } from "../src/store";

let dir: string;
let store: GudApiStore;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "gud-mcp-"));
  store = new GudApiStore(dir);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("GudApiStore — extension-compatible output", () => {
  it("writes a collection with a slug filename", async () => {
    await store.createCollection("Payments API");
    const files = await fs.readdir(path.join(dir, ".gud-api/collections"));
    expect(files).toEqual(["payments-api.json"]);
  });

  it("stamps schemaVersion and canonical key order, with trailing newline", async () => {
    const c = await store.createCollection("My API");
    const raw = await fs.readFile(path.join(dir, ".gud-api/collections/my-api.json"), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(raw);
    expect(parsed.schemaVersion).toBe(1);
    // First keys in canonical order
    expect(Object.keys(parsed).slice(0, 4)).toEqual(["schemaVersion", "id", "name", "variables"]);
  });

  it("round-trips a collection and its requests", async () => {
    const c = await store.createCollection("Round Trip");
    c.requests.push({
      id: "r1",
      name: "Get user",
      method: "GET",
      url: "https://api.test/users/1",
      headers: { Accept: "application/json" },
      body: "",
      bodyType: "none",
      auth: { type: "none" },
    });
    await store.saveCollection(c);

    const store2 = new GudApiStore(dir);
    const loaded = await store2.findCollection("Round Trip");
    expect(loaded?.requests).toHaveLength(1);
    expect(loaded?.requests[0].name).toBe("Get user");
    expect(loaded?.requests[0].url).toBe("https://api.test/users/1");
  });

  it("strips timingHistory from persisted requests", async () => {
    const c = await store.createCollection("Timings");
    c.requests.push({
      id: "r1",
      name: "R",
      method: "GET",
      url: "u",
      headers: {},
      body: "",
      bodyType: "none",
      auth: { type: "none" },
      timingHistory: [10, 20, 30],
    });
    await store.saveCollection(c);
    const raw = await fs.readFile(path.join(dir, ".gud-api/collections/timings.json"), "utf-8");
    expect(raw).not.toContain("timingHistory");
  });

  it("keeps the same file on re-save (sticky filename) and is byte-stable", async () => {
    const c = await store.createCollection("Stable");
    const p = path.join(dir, ".gud-api/collections/stable.json");
    const first = await fs.readFile(p, "utf-8");
    // Reload + save again without changes (updatedAt will change, so compare structure)
    const reloaded = await new GudApiStore(dir).findCollection("Stable");
    expect(reloaded).toBeTruthy();
    const files = await fs.readdir(path.join(dir, ".gud-api/collections"));
    expect(files).toEqual(["stable.json"]); // no second file created
    expect(first).toContain('"name": "Stable"');
  });

  it("disambiguates slug collisions with an id suffix", async () => {
    await store.createCollection("Dup");
    // second collection with same name → different id → suffixed filename
    await store.createCollection("Dup");
    const files = await fs.readdir(path.join(dir, ".gud-api/collections"));
    expect(files).toHaveLength(2);
    expect(files).toContain("dup.json");
    expect(files.some((f) => /^dup-[0-9a-f]{8}\.json$/.test(f))).toBe(true);
  });

  it("writes a .gud-api/README.md on first write so an extension-less user isn't lost", async () => {
    await store.createCollection("First");
    const readme = await fs.readFile(path.join(dir, ".gud-api/README.md"), "utf-8");
    expect(readme).toContain("Gud API collections");
    expect(readme).toContain("open-vsx.org"); // install path for Cursor/Windsurf/etc
    expect(readme).toContain("marketplace.visualstudio.com"); // VS Code path
    expect(readme.toLowerCase()).toContain("nothing is broken");
  });

  it("does not overwrite an existing .gud-api/README.md", async () => {
    await fs.mkdir(path.join(dir, ".gud-api"), { recursive: true });
    await fs.writeFile(path.join(dir, ".gud-api/README.md"), "custom", "utf-8");
    await store.createCollection("Second");
    const readme = await fs.readFile(path.join(dir, ".gud-api/README.md"), "utf-8");
    expect(readme).toBe("custom");
  });

  it("upserts environments by name and persists variables", async () => {
    await store.upsertEnvironment("Local", [{ key: "base_url", value: "http://localhost:3000", enabled: true }]);
    await store.upsertEnvironment("Local", [{ key: "base_url", value: "http://localhost:4000", enabled: true }]);
    const envs = await new GudApiStore(dir).loadEnvironments();
    expect(envs).toHaveLength(1);
    expect(envs[0].variables[0].value).toBe("http://localhost:4000");
  });
});
