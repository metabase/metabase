import fs from "node:fs";
import path from "node:path";

import { buildDevCsp, readAllowedHosts } from "./dev-connect-src";

jest.mock("node:fs");

const mockedFs = jest.mocked(fs);

const APP_ROOT = "/app";
const YAML_PATH = path.join(APP_ROOT, "data_app.yaml");
const YML_PATH = path.join(APP_ROOT, "data_app.yml");

/** Extract a single directive's value from a CSP header string. */
function directive(csp: string, name: string): string | undefined {
  return csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
    ?.slice(name.length)
    .trim();
}

describe("readAllowedHosts", () => {
  const setup = (files: Record<string, string>) => {
    mockedFs.existsSync.mockImplementation((p) => p.toString() in files);
    mockedFs.readFileSync.mockImplementation((p) => {
      const content = files[p.toString()];

      if (content == null) {
        throw new Error(`unexpected read: ${p}`);
      }

      return content;
    });

    return { hosts: readAllowedHosts(APP_ROOT) };
  };

  afterEach(() => jest.resetAllMocks());

  it("returns [] when no manifest exists", () => {
    expect(setup({}).hosts).toEqual([]);
  });

  it("reads allowed_hosts from data_app.yaml", () => {
    const { hosts } = setup({
      [YAML_PATH]:
        "allowed_hosts:\n  - https://api.example.com\n  - https://*.acme.com\n",
    });
    expect(hosts).toEqual(["https://api.example.com", "https://*.acme.com"]);
  });

  it("falls back to data_app.yml when there is no .yaml", () => {
    const { hosts } = setup({
      [YML_PATH]: "allowed_hosts:\n  - https://api.example.com\n",
    });
    expect(hosts).toEqual(["https://api.example.com"]);
  });

  it("prefers data_app.yaml over data_app.yml when both exist", () => {
    const { hosts } = setup({
      [YAML_PATH]: "allowed_hosts:\n  - https://from-yaml.com\n",
      [YML_PATH]: "allowed_hosts:\n  - https://from-yml.com\n",
    });
    expect(hosts).toEqual(["https://from-yaml.com"]);
  });

  it("returns [] when the manifest has no allowed_hosts key", () => {
    expect(setup({ [YAML_PATH]: "name: My App\n" }).hosts).toEqual([]);
  });

  it("throws on malformed YAML", () => {
    expect(() => setup({ [YAML_PATH]: "allowed_hosts: [unclosed" })).toThrow(
      /Could not parse/,
    );
  });

  it("throws when allowed_hosts is not a list", () => {
    expect(() => setup({ [YAML_PATH]: "allowed_hosts: nope\n" })).toThrow(
      /"allowed_hosts" must be a list/,
    );
  });

  it("throws on a non-string entry", () => {
    expect(() =>
      setup({
        [YAML_PATH]: "allowed_hosts:\n  - https://ok.com\n  - 42\n",
      }),
    ).toThrow(/must be a string/);
  });
});

describe("buildDevCsp", () => {
  it("blocks native submits and limits framing to 'self' when no allowed_hosts", () => {
    const csp = buildDevCsp([], undefined);

    expect(directive(csp, "connect-src")).toBe(
      "'self' ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:*",
    );
    expect(directive(csp, "form-action")).toBe("'none'");
    expect(directive(csp, "frame-src")).toBe("'self'");
  });

  it("adds allowed_hosts to connect-src, form-action and frame-src", () => {
    const hosts = ["https://api.example.com", "https://*.trusted.test"];
    const csp = buildDevCsp(hosts, undefined);

    for (const host of hosts) {
      expect(directive(csp, "connect-src")).toContain(host);
    }
    expect(directive(csp, "form-action")).toBe(hosts.join(" "));
    expect(directive(csp, "frame-src")).toBe(`'self' ${hosts.join(" ")}`);
  });

  it("adds the Metabase instance origin to connect-src only, normalized to an origin", () => {
    const csp = buildDevCsp([], "http://localhost:3000/app?token=secret#x");

    expect(directive(csp, "connect-src")).toContain("http://localhost:3000");
    // Only the origin — never the path/query/fragment.
    expect(csp).not.toContain("/app");
    expect(csp).not.toContain("secret");
    // The instance origin is for fetch, not for submitting/framing.
    expect(directive(csp, "form-action")).toBe("'none'");
    expect(directive(csp, "frame-src")).toBe("'self'");
  });

  it("ignores an unparseable Metabase URL", () => {
    const csp = buildDevCsp([], "not a url");

    expect(directive(csp, "connect-src")).not.toContain("not a url");
  });
});
