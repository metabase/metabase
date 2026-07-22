import { DATA_APP_DIAGNOSTIC_MAX_CHARS } from "../../constants/diagnostics-channel";
// `formatDevDiagnostic` is a lens onto captured entries — the projection lives
// in the payload module now, this spec only uses it to read what was captured.
import { formatDevDiagnostic } from "../../lib/diagnostics-payload";
import type { DevDiagnosticEntry } from "../../types/diagnostics";

import { devDiagnostics } from "./diagnostics";

const last = (entries: readonly DevDiagnosticEntry[]) =>
  entries[entries.length - 1];

let forwarded: unknown[][] = [];
let originalConsoleError: typeof console.error;
/** The active capture's teardown, so a test can uninstall and reinstall. */
let uninstall: () => void;

beforeAll(() => {
  originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    forwarded.push(args);
  };
  uninstall = devDiagnostics.install();
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

  it("formats Error arguments using their message", () => {
    console.error(new Error("kaboom"));

    expect(formatDevDiagnostic(last(devDiagnostics.getEntries()))).toContain(
      "kaboom",
    );
  });

  it("captures uncaught window errors", () => {
    const event = Object.assign(new Event("error"), {
      message: "window blew up",
    });
    window.dispatchEvent(event);

    expect(formatDevDiagnostic(last(devDiagnostics.getEntries()))).toContain(
      "window blew up",
    );
  });

  it("captures unhandled promise rejections", () => {
    const event = Object.assign(new Event("unhandledrejection"), {
      reason: "nope",
    });
    window.dispatchEvent(event);

    expect(formatDevDiagnostic(last(devDiagnostics.getEntries()))).toBe(
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

    const entry = last(devDiagnostics.getEntries());
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

    expect(formatDevDiagnostic(last(devDiagnostics.getEntries()))).toBe(
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

  it("is idempotent — installing again does not double-record", () => {
    devDiagnostics.install();
    console.error("once");

    expect(devDiagnostics.getEntries()).toHaveLength(1);
  });

  it("caps stored entries at 200, keeping the most recent", () => {
    for (let i = 0; i < 205; i++) {
      console.error(`error ${i}`);
    }

    const entries = devDiagnostics.getEntries();
    expect(entries).toHaveLength(200);
    expect(formatDevDiagnostic(entries[0])).toBe("error 5");
    expect(formatDevDiagnostic(last(entries))).toBe("error 204");
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

    expect(formatDevDiagnostic(last(devDiagnostics.getEntries()))).toBe(
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

    expect(formatDevDiagnostic(last(devDiagnostics.getEntries()))).toBe(
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

    expect(formatDevDiagnostic(last(devDiagnostics.getEntries()))).toBe(
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
    devDiagnostics.install();
    devDiagnostics.clear();

    // The count cap alone bounds nothing: one entry can be arbitrarily large,
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

describe("devDiagnostics.install teardown", () => {
  it("stops capturing, and a reinstall records once rather than twice", () => {
    uninstall();
    devDiagnostics.clear();

    console.error("after teardown");
    expect(devDiagnostics.getEntries()).toHaveLength(0);

    // Reinstalling wraps the restored console.error, not the previous wrapper —
    // without the teardown resetting `installed`, an HMR reload of the dev entry
    // would double every capture.
    uninstall = devDiagnostics.install();
    devDiagnostics.clear();
    console.error("once");

    expect(devDiagnostics.getEntries()).toHaveLength(1);
  });
});
