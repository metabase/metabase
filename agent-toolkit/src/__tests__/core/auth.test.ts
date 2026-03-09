import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveAuth, getAuthHeaders } from "../../core/auth.js";

describe("resolveAuth", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.METABASE_API_KEY;
    delete process.env.METABASE_SESSION_TOKEN;
  });
  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("uses apiKey from opts", () => {
    const auth = resolveAuth({ apiKey: "test-key" });
    expect(auth.apiKey).toBe("test-key");
  });

  it("uses apiKey from env", () => {
    process.env.METABASE_API_KEY = "env-key";
    const auth = resolveAuth({});
    expect(auth.apiKey).toBe("env-key");
  });

  it("uses sessionToken from opts", () => {
    const auth = resolveAuth({ sessionToken: "tok" });
    expect(auth.sessionToken).toBe("tok");
  });

  it("throws when no auth provided", () => {
    expect(() => resolveAuth({})).toThrow("Authentication required");
  });
});

describe("getAuthHeaders", () => {
  it("returns X-Api-Key header", () => {
    expect(getAuthHeaders({ apiKey: "key123" })).toEqual({
      "X-Api-Key": "key123",
    });
  });

  it("returns X-Metabase-Session header", () => {
    expect(getAuthHeaders({ sessionToken: "sess" })).toEqual({
      "X-Metabase-Session": "sess",
    });
  });

  it("prefers apiKey over sessionToken", () => {
    const headers = getAuthHeaders({
      apiKey: "key",
      sessionToken: "sess",
    });
    expect(headers).toEqual({ "X-Api-Key": "key" });
  });

  it("returns empty when no auth", () => {
    expect(getAuthHeaders({})).toEqual({});
  });
});
