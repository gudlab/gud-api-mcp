import { describe, it, expect } from "vitest";
import { maskSecrets, isSecretKey, truncateBody } from "../src/util";

describe("secret masking", () => {
  it("flags secret-looking keys", () => {
    for (const k of ["api_key", "TOKEN", "authToken", "password", "client_secret", "bearer"]) {
      expect(isSecretKey(k)).toBe(true);
    }
    for (const k of ["base_url", "username", "page", "limit", "host"]) {
      expect(isSecretKey(k)).toBe(false);
    }
  });

  it("masks secret values but keeps keys visible", () => {
    const masked = maskSecrets([
      { key: "base_url", value: "http://localhost", enabled: true },
      { key: "api_key", value: "sk-live-123", enabled: true },
    ]);
    expect(masked[0].value).toBe("http://localhost");
    expect(masked[0].masked).toBe(false);
    expect(masked[1].value).toBe("•••• (set)");
    expect(masked[1].masked).toBe(true);
  });

  it("does not mask an empty secret value", () => {
    const masked = maskSecrets([{ key: "token", value: "", enabled: true }]);
    expect(masked[0].masked).toBe(false);
  });
});

describe("body truncation", () => {
  it("passes through short bodies", () => {
    const r = truncateBody("hello", 100);
    expect(r.truncated).toBe(false);
    expect(r.body).toBe("hello");
  });

  it("truncates long bodies with a marker", () => {
    const r = truncateBody("x".repeat(200), 50);
    expect(r.truncated).toBe(true);
    expect(r.fullLength).toBe(200);
    expect(r.body).toContain("truncated 150 of 200 chars");
  });
});
