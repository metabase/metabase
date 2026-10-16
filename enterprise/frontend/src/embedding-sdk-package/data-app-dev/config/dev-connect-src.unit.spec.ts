import { buildDevCsp } from "./dev-connect-src";

/** Extract a single directive's value from a CSP header string. */
function directive(csp: string, name: string): string | undefined {
  return csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
    ?.slice(name.length)
    .trim();
}

describe("buildDevCsp", () => {
  it("blocks native submits and framing", () => {
    const csp = buildDevCsp([], undefined);

    expect(directive(csp, "connect-src")).toBe(
      "'self' ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:*",
    );
    expect(directive(csp, "form-action")).toBe("'none'");
    expect(directive(csp, "frame-src")).toBe("'none'");
  });

  it("adds allowed_hosts to connect-src only, never to form-action or frame-src", () => {
    const hosts = ["https://api.example.com", "https://*.trusted.test"];
    const csp = buildDevCsp(hosts, undefined);

    for (const host of hosts) {
      expect(directive(csp, "connect-src")).toContain(host);
    }
    expect(directive(csp, "form-action")).toBe("'none'");
    expect(directive(csp, "frame-src")).toBe("'none'");
  });

  it("adds the Metabase instance origin to connect-src only, normalized to an origin", () => {
    const csp = buildDevCsp([], "http://localhost:3000/app?token=secret#x");

    expect(directive(csp, "connect-src")).toContain("http://localhost:3000");
    // Only the origin — never the path/query/fragment.
    expect(csp).not.toContain("/app");
    expect(csp).not.toContain("secret");
    // The instance origin is for fetch, not for submitting/framing.
    expect(directive(csp, "form-action")).toBe("'none'");
    expect(directive(csp, "frame-src")).toBe("'none'");
  });

  it("ignores an unparseable Metabase URL", () => {
    const csp = buildDevCsp([], "not a url");

    expect(directive(csp, "connect-src")).not.toContain("not a url");
  });
});
