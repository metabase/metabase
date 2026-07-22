import {
  type SandboxRealm,
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

  it("matches an explicit port exactly", () => {
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
  });

  it("does not treat a portless entry as any port, as CSP does not", () => {
    // The browser evaluates the same `allowed_hosts` through `connect-src`,
    // where a host-source without a port means the scheme's default port only.
    // Allowing any port here would let the sandbox fire a request the browser
    // then blocks — reported as a CSP violation, sending the author after the
    // wrong fix.
    expect(
      isHostAllowed(u("https://api.example.com:8443/"), [
        "https://api.example.com",
      ]),
    ).toBe(false);
    expect(
      isHostAllowed(u("https://api.example.com/"), ["https://api.example.com"]),
    ).toBe(true);
  });

  it("treats an explicit default port the same as none (agrees with CSP)", () => {
    // `URL` strips the default port (`:443`/`:80` → ""), so an entry that spells
    // it out must still match a default-port request — otherwise the JS allowlist
    // would disagree with the browser's CSP matching.
    expect(
      isHostAllowed(u("https://api.example.com/"), [
        "https://api.example.com:443",
      ]),
    ).toBe(true);
    expect(
      isHostAllowed(u("http://api.example.com/"), [
        "http://api.example.com:80",
      ]),
    ).toBe(true);
  });

  it("denies everything for an empty allowlist", () => {
    expect(isHostAllowed(u("https://api.example.com/"), [])).toBe(false);
  });
});

describe("makeSandboxFetch", () => {
  const base = "https://mb.example.com/embed/apps/sales";
  const origin = "https://mb.example.com";

  const fakeWindow = (fetch: typeof global.fetch): SandboxRealm => ({
    fetch,
    XMLHttpRequest,
    location: { href: base, origin },
  });

  it("returns null for an empty allowlist (keeps the sandbox hard block)", () => {
    expect(makeSandboxFetch(window, [], "sales")).toBeNull();
  });

  it("allows listed hosts and blocks others", async () => {
    const realFetch = jest.fn(() => Promise.resolve(new Response("ok")));
    const sandboxFetch = makeSandboxFetch(
      fakeWindow(realFetch),
      ["https://api.example.com"],
      "sales",
    );
    expect(sandboxFetch).not.toBeNull();

    await sandboxFetch!("https://api.example.com/data");
    expect(realFetch).toHaveBeenCalledTimes(1);

    await expect(sandboxFetch!("https://evil.example.org/")).rejects.toThrow(
      /blocked fetch/,
    );
    expect(realFetch).toHaveBeenCalledTimes(1);
  });

  it("always blocks the Metabase origin, even if it's in allowed_hosts", async () => {
    const realFetch = jest.fn(() => Promise.resolve(new Response("ok")));
    // The Metabase origin is mistakenly allowlisted — it must still be denied.
    const sandboxFetch = makeSandboxFetch(
      fakeWindow(realFetch),
      [origin, "https://api.example.com"],
      "sales",
    )!;

    await expect(sandboxFetch(`${origin}/api/user/current`)).rejects.toThrow(
      /reachable only via the SDK/,
    );
    // A relative URL resolves to the Metabase origin too.
    await expect(sandboxFetch("/api/user/current")).rejects.toThrow(
      /reachable only via the SDK/,
    );
    expect(realFetch).not.toHaveBeenCalled();
  });
});

describe("makeSandboxXhr", () => {
  // jsdom's window origin is http://localhost — treat that as the Metabase origin.
  const mbOrigin = window.location.origin;

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

  it("always blocks the Metabase origin, even if it's in allowed_hosts", () => {
    const SandboxXhr = makeSandboxXhr(
      window,
      [mbOrigin, "https://api.example.com"],
      "sales",
    )!;
    const xhr = new SandboxXhr();
    expect(() => xhr.open("GET", `${mbOrigin}/api/user/current`)).toThrow(
      /reachable only via the SDK/,
    );
    expect(() => xhr.open("GET", "/api/user/current")).toThrow(
      /reachable only via the SDK/,
    );
  });
});

describe("onBlocked reporting", () => {
  const base = "https://mb.example.com/embed/apps/sales";
  const origin = "https://mb.example.com";
  const fakeWindow = (fetch: typeof global.fetch): SandboxRealm => ({
    fetch,
    XMLHttpRequest,
    location: { href: base, origin },
  });

  it("reports a blocked fetch, and stays silent when no listener is given", async () => {
    const realFetch = jest.fn(() => Promise.resolve(new Response("ok")));
    const onBlocked = jest.fn();

    const reporting = makeSandboxFetch(
      fakeWindow(realFetch),
      ["https://api.example.com"],
      "sales",
      onBlocked,
    )!;
    await expect(reporting("https://evil.example.org/x")).rejects.toThrow();

    expect(onBlocked).toHaveBeenCalledWith(
      // `type: "network"` is added a layer up, in `distortions.ts`.
      expect.objectContaining({
        api: "fetch",
        url: "https://evil.example.org/x",
        reason: expect.stringContaining("not in allowed_hosts"),
      }),
    );

    // Production passes no listener; that path must be unchanged.
    const silent = makeSandboxFetch(
      fakeWindow(realFetch),
      ["https://api.example.com"],
      "sales",
    )!;
    await expect(silent("https://evil.example.org/x")).rejects.toThrow();
    expect(realFetch).not.toHaveBeenCalled();
  });

  it("still blocks when the listener throws", async () => {
    const realFetch = jest.fn(() => Promise.resolve(new Response("ok")));
    const sandboxFetch = makeSandboxFetch(
      fakeWindow(realFetch),
      ["https://api.example.com"],
      "sales",
      () => {
        throw new Error("listener exploded");
      },
    )!;

    // A broken reporter must not become a way through the allowlist.
    await expect(sandboxFetch("https://evil.example.org/")).rejects.toThrow();
    expect(realFetch).not.toHaveBeenCalled();
  });
});
