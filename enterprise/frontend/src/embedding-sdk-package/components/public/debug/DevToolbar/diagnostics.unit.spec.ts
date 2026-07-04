import {
  type DevDiagnosticEntry,
  clearDevDiagnostics,
  getDevDiagnostics,
  installDevDiagnostics,
  subscribeDevDiagnostics,
} from "./diagnostics";

const last = (entries: readonly DevDiagnosticEntry[]) =>
  entries[entries.length - 1];

let forwarded: unknown[][] = [];
let originalConsoleError: typeof console.error;

beforeAll(() => {
  originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    forwarded.push(args);
  };
  installDevDiagnostics();
});

afterAll(() => {
  console.error = originalConsoleError;
});

beforeEach(() => {
  clearDevDiagnostics();
  forwarded = [];
});

describe("dev diagnostics store", () => {
  it("starts empty", () => {
    expect(getDevDiagnostics()).toEqual([]);
  });

  it("records console.error calls as error entries with id/time/message", () => {
    console.error("boom", { code: 1 });

    const entries = getDevDiagnostics();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "error",
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

    expect(last(getDevDiagnostics()).message).toContain("kaboom");
  });

  it("captures uncaught window errors", () => {
    const event = new Event("error") as Event & { message: string };
    event.message = "window blew up";
    window.dispatchEvent(event);

    expect(last(getDevDiagnostics()).message).toContain("window blew up");
  });

  it("captures unhandled promise rejections", () => {
    const event = new Event("unhandledrejection") as Event & {
      reason: unknown;
    };
    event.reason = "nope";
    window.dispatchEvent(event);

    expect(last(getDevDiagnostics()).message).toBe("Unhandled rejection: nope");
  });

  it("captures CSP form-action violations (e.g. a blocked native form submit)", () => {
    const event = new Event("securitypolicyviolation") as Event &
      Partial<SecurityPolicyViolationEvent>;
    Object.assign(event, {
      effectiveDirective: "form-action",
      violatedDirective: "form-action",
      blockedURI: "https://example.com/",
      originalPolicy: "connect-src 'self'; form-action 'none'",
    });
    window.dispatchEvent(event);

    expect(last(getDevDiagnostics()).message).toBe(
      "Content Security Policy (form-action) blocked https://example.com/",
    );
  });

  it("formats other CSP violations generically (e.g. connect-src)", () => {
    const event = new Event("securitypolicyviolation") as Event &
      Partial<SecurityPolicyViolationEvent>;
    Object.assign(event, {
      effectiveDirective: "connect-src",
      violatedDirective: "connect-src",
      blockedURI: "https://evil.test/",
      originalPolicy: "connect-src 'self'; form-action 'none'",
    });
    window.dispatchEvent(event);

    expect(last(getDevDiagnostics()).message).toBe(
      "Content Security Policy (connect-src) blocked https://evil.test/",
    );
  });

  it("notifies subscribers on record and clear, and stops after unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeDevDiagnostics(listener);

    console.error("one");
    expect(listener).toHaveBeenCalledTimes(1);

    clearDevDiagnostics();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    console.error("two");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns a fresh array reference per record (so useSyncExternalStore re-renders)", () => {
    const before = getDevDiagnostics();
    console.error("change");

    expect(getDevDiagnostics()).not.toBe(before);
  });

  it("is idempotent — installing again does not double-record", () => {
    installDevDiagnostics();
    console.error("once");

    expect(getDevDiagnostics()).toHaveLength(1);
  });

  it("caps stored entries at 200, keeping the most recent", () => {
    for (let i = 0; i < 205; i++) {
      console.error(`error ${i}`);
    }

    const entries = getDevDiagnostics();
    expect(entries).toHaveLength(200);
    expect(entries[0].message).toBe("error 5");
    expect(last(entries).message).toBe("error 204");
  });
});
