import {
  isHostAllowed,
  makeSandboxFetch,
  makeSandboxXhr,
} from "./allowed-hosts";

const u = (href: string) => new URL(href);

describe("isHostAllowed", () => {
  it("matches an exact host (ignoring path)", () => {
    expect(
      isHostAllowed(u("https://api.example.com/v1/x"), [
        "https://api.example.com",
      ]),
    ).toBe(true);
  });

  it("rejects a different host", () => {
    expect(
      isHostAllowed(u("https://evil.example.org/"), [
        "https://api.example.com",
      ]),
    ).toBe(false);
  });

  it("rejects a protocol mismatch", () => {
    expect(
      isHostAllowed(u("http://api.example.com/"), ["https://api.example.com"]),
    ).toBe(false);
  });

  it("matches subdomains for a wildcard but not the apex", () => {
    const allow = ["https://*.example.com"];
    expect(isHostAllowed(u("https://a.example.com/"), allow)).toBe(true);
    expect(isHostAllowed(u("https://a.b.example.com/"), allow)).toBe(true);
    expect(isHostAllowed(u("https://example.com/"), allow)).toBe(false);
    expect(isHostAllowed(u("https://notexample.com/"), allow)).toBe(false);
  });

  it("honors an explicit port (and an entry without one allows any)", () => {
    expect(
      isHostAllowed(u("https://api.example.com:8443/"), [
        "https://api.example.com:8443",
      ]),
    ).toBe(true);
    expect(
      isHostAllowed(u("https://api.example.com:9999/"), [
        "https://api.example.com:8443",
      ]),
    ).toBe(false);
    expect(
      isHostAllowed(u("https://api.example.com:8443/"), [
        "https://api.example.com",
      ]),
    ).toBe(true);
  });

  it("denies everything for an empty allowlist", () => {
    expect(isHostAllowed(u("https://api.example.com/"), [])).toBe(false);
  });
});

describe("makeSandboxFetch", () => {
  const base = "https://mb.example.com/embed/data-app/sales";

  it("returns null for an empty allowlist (keeps the sandbox hard block)", () => {
    expect(makeSandboxFetch(window, [], "sales")).toBeNull();
  });

  it("allows listed hosts, blocks others and the Metabase origin", async () => {
    const realFetch = jest.fn(() => Promise.resolve(new Response("ok")));
    const fakeWindow = {
      fetch: realFetch,
      location: { href: base },
    } as unknown as Window & typeof globalThis;

    const sandboxFetch = makeSandboxFetch(
      fakeWindow,
      ["https://api.example.com"],
      "sales",
    );
    expect(sandboxFetch).not.toBeNull();

    await sandboxFetch!("https://api.example.com/data");
    expect(realFetch).toHaveBeenCalledTimes(1);

    await expect(sandboxFetch!("https://evil.example.org/")).rejects.toThrow(
      /blocked fetch/,
    );
    // A relative URL resolves to the Metabase origin — must stay blocked.
    await expect(sandboxFetch!("/api/user/current")).rejects.toThrow(
      /blocked fetch/,
    );
    expect(realFetch).toHaveBeenCalledTimes(1);
  });
});

describe("makeSandboxXhr", () => {
  it("returns null for an empty allowlist", () => {
    expect(makeSandboxXhr(window, [], "sales")).toBeNull();
  });

  it("gates open() against the allowlist", () => {
    const SandboxXhr = makeSandboxXhr(
      window,
      ["https://api.example.com"],
      "sales",
    );
    expect(SandboxXhr).not.toBeNull();

    const xhr = new SandboxXhr!();
    expect(() => xhr.open("GET", "https://evil.example.org/")).toThrow(
      /blocked XMLHttpRequest/,
    );
    // Allowed host: open() should not throw.
    expect(() => xhr.open("GET", "https://api.example.com/data")).not.toThrow();
  });
});
