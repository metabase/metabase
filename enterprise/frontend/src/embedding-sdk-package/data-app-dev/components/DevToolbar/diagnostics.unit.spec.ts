import { DATA_APP_DIAGNOSTIC_MAX_CHARS } from "../../constants/diagnostics-channel";
// `formatDevDiagnostic` is a lens onto captured entries — the projection lives
// in the payload module now, this spec only uses it to read what was captured.
import { formatDevDiagnostic } from "../../lib/diagnostics-payload";
import type { DevDiagnosticEntry } from "../../types/diagnostics";

import { devDiagnostics } from "./diagnostics";

const getLastEntry = (entries: readonly DevDiagnosticEntry[]) =>
  entries[entries.length - 1];

let forwarded: unknown[][] = [];
let originalConsoleError: typeof console.error;

beforeAll(() => {
  originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    forwarded.push(args);
  };
  devDiagnostics.install();
});

afterAll(() => {
  console.error = originalConsoleError;
});

beforeEach(() => {
  devDiagnostics.clear();
  forwarded = [];
});

describe("dev diagnostics collector", () => {
  it("starts empty", () => {
    expect(devDiagnostics.getEntries()).toEqual([]);
  });

  it("records console.error calls as error entries with id/time/message", () => {
    console.error("boom", { code: 1 });

    const entries = devDiagnostics.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "error",
      message: 'boom {"code":1}',
    });
    expect(typeof entries[0].id).toBe("number");
    expect(typeof entries[0].time).toBe("number");
  });

  it("still forwards to the original console.error", () => {
    console.error("passed through");

    expect(forwarded).toContainEqual(["passed through"]);
  });

  describe("%s substitution", () => {
    const lastMessage = () =>
      formatDevDiagnostic(getLastEntry(devDiagnostics.getEntries()));

    it("substitutes them the way the browser console renders them", () => {
      // The verbatim shape of a React warning: a format string plus its substitutions.
      console.error(
        'Warning: Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.%s',
        "",
        "\n\nCheck the render method of `App`.",
        "\n    in div",
      );

      expect(lastMessage()).toBe(
        'Warning: Each child in a list should have a unique "key" prop.' +
          "\n\nCheck the render method of `App`." +
          " See https://reactjs.org/link/warning-keys for more information." +
          "\n    in div",
      );
    });

    it("leaves other specifiers to the console's raw text", () => {
      // Only `%s` is substituted — React never emits these, and getting them verbatim in
      // the toolbar is a cosmetic loss rather than a misleading one.
      console.error("%d items", 3);

      expect(lastMessage()).toBe("%d items 3");
    });

    it("leaves a specifier alone when no argument is left, and appends the extras", () => {
      console.error("only %s and %s", "one");
      expect(lastMessage()).toBe("only one and %s");

      console.error("%s then", "first", "extra");
      expect(lastMessage()).toBe("first then extra");
    });

    it("still space-joins when the first argument carries no specifier", () => {
      console.error("boom", { code: 1 });

      expect(lastMessage()).toBe('boom {"code":1}');
    });
  });

  it("survives arguments JSON cannot represent", () => {
    const noop = () => undefined;

    // `JSON.stringify` returns undefined rather than throwing for these. The
    // wrapper must still record and forward — breaking `console.error` itself
    // would take the app down over a log line.
    console.error(undefined);
    console.error(noop);
    console.error(Symbol("sym"));

    expect(
      devDiagnostics.getEntries().map((entry) => formatDevDiagnostic(entry)),
    ).toEqual(["undefined", String(noop), "Symbol(sym)"]);
    expect(forwarded).toContainEqual([undefined]);
    expect(forwarded).toContainEqual([noop]);
  });

  it("formats Error arguments using their message", () => {
    console.error(new Error("kaboom"));

    expect(
      formatDevDiagnostic(getLastEntry(devDiagnostics.getEntries())),
    ).toContain("kaboom");
  });

  it("captures uncaught window errors", () => {
    const event = Object.assign(new Event("error"), {
      message: "window blew up",
    });
    window.dispatchEvent(event);

    expect(
      formatDevDiagnostic(getLastEntry(devDiagnostics.getEntries())),
    ).toContain("window blew up");
  });

  it("captures unhandled promise rejections", () => {
    const event = Object.assign(new Event("unhandledrejection"), {
      reason: "nope",
    });
    window.dispatchEvent(event);

    expect(formatDevDiagnostic(getLastEntry(devDiagnostics.getEntries()))).toBe(
      "Unhandled rejection: nope",
    );
  });

  it("captures CSP violations as typed entries", () => {
    const event = Object.assign(new Event("securitypolicyviolation"), {
      effectiveDirective: "form-action",
      violatedDirective: "form-action",
      blockedURI: "https://example.com/",
      originalPolicy: "connect-src 'self'; form-action 'none'",
    } satisfies Partial<SecurityPolicyViolationEvent>);
    window.dispatchEvent(event);

    const entry = getLastEntry(devDiagnostics.getEntries());
    expect(entry).toMatchObject({
      kind: "csp-violation",
      directive: "form-action",
      blockedUri: "https://example.com/",
    });
    expect(formatDevDiagnostic(entry)).toBe(
      "Content Security Policy (form-action) blocked https://example.com/",
    );
  });

  it("formats a CSP violation with an empty URI as inline content", () => {
    devDiagnostics.record({
      kind: "csp-violation",
      directive: "script-src",
      blockedUri: "",
    });

    expect(formatDevDiagnostic(getLastEntry(devDiagnostics.getEntries()))).toBe(
      "Content Security Policy (script-src) blocked inline content",
    );
  });

  it("notifies subscribers on record and clear, and stops after unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = devDiagnostics.subscribe(listener);

    console.error("one");
    expect(listener).toHaveBeenCalledTimes(1);

    devDiagnostics.clear();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    console.error("two");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns a fresh array reference per record (so useSyncExternalStore re-renders)", () => {
    const before = devDiagnostics.getEntries();
    console.error("change");

    expect(devDiagnostics.getEntries()).not.toBe(before);
  });

  it("trims stored entries to 200, keeping the most recent", () => {
    for (let i = 0; i < 205; i++) {
      console.error(`error ${i}`);
    }

    const entries = devDiagnostics.getEntries();
    expect(entries).toHaveLength(200);
    expect(formatDevDiagnostic(entries[0])).toBe("error 5");
    expect(formatDevDiagnostic(getLastEntry(entries))).toBe("error 204");
  });

  it("does not let a flood of requests evict earlier errors", () => {
    console.error("the error worth keeping");

    for (let i = 0; i < 500; i++) {
      devDiagnostics.record({
        kind: "sdk-call",
        method: "GET",
        endpoint: `/api/card/${i}`,
        status: 200,
        durationMs: 1,
      });
    }

    // A polling app used to push whatever explained its own failures out of the
    // shared buffer — the one entry an author or an agent actually needs.
    const entries = devDiagnostics.getEntries();
    expect(formatDevDiagnostic(entries[0])).toBe("the error worth keeping");
    expect(entries.filter((entry) => entry.kind === "sdk-call")).toHaveLength(
      50,
    );
  });
});

describe("devDiagnostics.recordSandboxBlocked", () => {
  it("records a blocked API as a blocked-api entry and logs it uncaptured", () => {
    devDiagnostics.recordSandboxBlocked({
      type: "api",
      message: "[data-app dev] blocked API call: document.write",
    });

    const entries = devDiagnostics.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "blocked-api",
      message: "[data-app dev] blocked API call: document.write",
    });
    // Forwarded to the real console, without being re-captured as an error.
    expect(forwarded).toContainEqual([
      "[data-app dev] blocked API call: document.write",
    ]);
  });

  it("records a blocked network call as a blocked-network entry and logs it uncaptured", () => {
    devDiagnostics.recordSandboxBlocked({
      type: "network",
      api: "fetch",
      url: "https://evil.test/x",
      reason: "evil.test (not in allowed_hosts)",
    });

    const entries = devDiagnostics.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "blocked-network",
      api: "fetch",
      url: "https://evil.test/x",
      reason: "evil.test (not in allowed_hosts)",
    });
    expect(formatDevDiagnostic(entries[0])).toBe(
      "Blocked fetch to evil.test (not in allowed_hosts)",
    );
    expect(forwarded).toContainEqual([
      "[data-app dev] blocked fetch to evil.test (not in allowed_hosts)",
    ]);
  });
});

describe("sdk-call entries", () => {
  it("formats a completed call with status and duration", () => {
    devDiagnostics.record({
      kind: "sdk-call",
      method: "POST",
      endpoint: "/api/card/1/query",
      status: 202,
      durationMs: 45,
    });

    expect(formatDevDiagnostic(getLastEntry(devDiagnostics.getEntries()))).toBe(
      "POST /api/card/1/query → 202 (45ms)",
    );
  });

  it("keeps the endpoint on the summary line and the reason below it", () => {
    devDiagnostics.record({
      kind: "sdk-call",
      method: "POST",
      endpoint: "/api/dataset",
      status: 400,
      durationMs: 12,
      error: 'Table "orders" is not in the manifest',
    });

    expect(formatDevDiagnostic(getLastEntry(devDiagnostics.getEntries()))).toBe(
      'POST /api/dataset → 400 (12ms)\nTable "orders" is not in the manifest',
    );
  });

  it("formats a transport failure, which has no status", () => {
    devDiagnostics.record({
      kind: "sdk-call",
      method: "GET",
      endpoint: "/api/user/current",
      status: null,
      durationMs: 5,
      error: "Failed to fetch",
    });

    expect(formatDevDiagnostic(getLastEntry(devDiagnostics.getEntries()))).toBe(
      "GET /api/user/current → failed (5ms)\nFailed to fetch",
    );
  });
});

describe("connection status", () => {
  it("stores the connection status and notifies subscribers", () => {
    const listener = jest.fn();
    const unsubscribe = devDiagnostics.subscribe(listener);

    devDiagnostics.setConnectionStatus({
      checkedAt: 1,
      metabaseUrl: "http://localhost:3000",
      reachable: true,
      sdkVersion: "0.63.1",
      error: null,
    });

    expect(devDiagnostics.getConnectionStatus()).toMatchObject({
      reachable: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("bounded entry size", () => {
  it("truncates a huge logged object instead of retaining it whole", () => {
    devDiagnostics.clear();

    // The count limit alone bounds nothing: one entry can be arbitrarily large,
    // and it is retained twice and re-serialized on every poll.
    console.error("rows", {
      rows: Array.from({ length: 50_000 }, (_, i) => i),
    });

    const [entry] = devDiagnostics.getEntries();
    expect(entry.kind).toBe("error");
    const message = entry.kind === "error" ? entry.message : "";
    expect(message.length).toBeLessThan(DATA_APP_DIAGNOSTIC_MAX_CHARS * 2);
    expect(message).toContain("truncated");
  });
});

describe("build stamping", () => {
  // The collector is a singleton, so an id set here would follow the module
  // into every later test.
  afterEach(() => devDiagnostics.setBuildId(0));

  it("stamps entries with the bundle generation that was loaded", () => {
    devDiagnostics.setBuildId(2);
    console.error("from build two");

    // What lets a reader drop errors an earlier, half-finished edit produced
    // without dropping the ones the app is failing with now.
    expect(getLastEntry(devDiagnostics.getEntries()).buildId).toBe(2);
  });

  it("re-stamps as the preview rebuilds", () => {
    devDiagnostics.setBuildId(2);
    console.error("from build two");
    devDiagnostics.setBuildId(3);
    console.error("from build three");

    expect(devDiagnostics.getEntries().map((entry) => entry.buildId)).toEqual([
      2, 3,
    ]);
  });

  it("leaves entries unstamped until a bundle has loaded", () => {
    console.error("thrown by the preview page itself");

    // Nothing about the app's own code, so no build owns it: it stays visible
    // however many times the bundle is rebuilt.
    expect(getLastEntry(devDiagnostics.getEntries()).buildId).toBeNull();
  });

  it("treats a missing or unbuilt id as no build at all", () => {
    // `Number(null)` for an absent response header, and 0 from a dev server
    // that has not finished a build — neither may pass as a real generation,
    // or every entry would be filtered as stale.
    devDiagnostics.setBuildId(Number.NaN);
    console.error("no header");
    expect(getLastEntry(devDiagnostics.getEntries()).buildId).toBeNull();

    devDiagnostics.setBuildId(0);
    console.error("nothing built yet");
    expect(getLastEntry(devDiagnostics.getEntries()).buildId).toBeNull();
  });
});
