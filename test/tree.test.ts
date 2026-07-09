import { describe, it, expect } from "vitest";
import { upsertRequest, deleteRequest, findRequestDeep, addExample, ensureFolderPath, countRequests } from "../src/tree";
import type { Collection, SavedRequest } from "../src/core/models/collection";

function emptyCollection(): Collection {
  return {
    schemaVersion: 1,
    id: "c1",
    name: "Test",
    folders: [],
    requests: [],
    variables: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const reqBase: Omit<SavedRequest, "id"> = {
  name: "Create user",
  method: "POST",
  url: "{{base_url}}/users",
  headers: {},
  body: "{}",
  bodyType: "json",
  auth: { type: "none" },
};

describe("tree helpers", () => {
  it("creates a request at root", () => {
    const c = emptyCollection();
    const { requestId, created } = upsertRequest(c, [], reqBase);
    expect(created).toBe(true);
    expect(c.requests).toHaveLength(1);
    expect(c.requests[0].id).toBe(requestId);
  });

  it("upserts by name (second call updates, keeps id + examples)", () => {
    const c = emptyCollection();
    const first = upsertRequest(c, [], reqBase);
    addExample(c.requests[0], {
      label: "201",
      status: 201,
      headers: {},
      body: "{}",
      timeMs: 12,
      capturedAt: "2026-01-01T00:00:00Z",
    });
    const second = upsertRequest(c, [], { ...reqBase, url: "{{base_url}}/v2/users" });
    expect(second.created).toBe(false);
    expect(second.requestId).toBe(first.requestId); // id preserved
    expect(c.requests).toHaveLength(1); // not duplicated
    expect(c.requests[0].url).toBe("{{base_url}}/v2/users"); // updated
    expect(c.requests[0].examples).toHaveLength(1); // examples preserved
  });

  it("creates nested folders on demand", () => {
    const c = emptyCollection();
    upsertRequest(c, ["Auth", "JWT"], reqBase);
    expect(c.folders[0].name).toBe("Auth");
    expect(c.folders[0].folders[0].name).toBe("JWT");
    expect(c.folders[0].folders[0].requests).toHaveLength(1);
    expect(countRequests(c)).toBe(1);
  });

  it("ensureFolderPath reuses existing folders", () => {
    const c = emptyCollection();
    ensureFolderPath(c, ["A"]);
    ensureFolderPath(c, ["A", "B"]);
    expect(c.folders).toHaveLength(1);
    expect(c.folders[0].folders).toHaveLength(1);
  });

  it("finds a request by name or id anywhere", () => {
    const c = emptyCollection();
    upsertRequest(c, ["Deep"], reqBase);
    expect(findRequestDeep(c, "Create user")?.request.name).toBe("Create user");
  });

  it("deletes a request", () => {
    const c = emptyCollection();
    upsertRequest(c, [], reqBase);
    expect(deleteRequest(c, "Create user")).toBe(true);
    expect(c.requests).toHaveLength(0);
    expect(deleteRequest(c, "nope")).toBe(false);
  });

  it("caps examples at 5, evicting oldest", () => {
    const c = emptyCollection();
    upsertRequest(c, [], reqBase);
    const r = c.requests[0];
    for (let i = 1; i <= 7; i++) {
      addExample(r, { label: `e${i}`, status: 200, headers: {}, body: "", timeMs: 1, capturedAt: "" });
    }
    expect(r.examples).toHaveLength(5);
    expect(r.examples![0].label).toBe("e3"); // e1,e2 evicted
    expect(r.examples![4].label).toBe("e7");
  });
});
