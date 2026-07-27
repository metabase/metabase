import { makeDistortionCallback } from "./distortions";
import type { SandboxRealm } from "./types";

// A minimal stand-in for the iframe window the data-app sandbox is built on.
// `fetch`/`XMLHttpRequest` are the native refs the membrane passes to the
// distortion callback; `makeDistortionCallback` should route those to the
// allowlist wrappers and delegate everything else to the shared callback.
const fakeWindow = (): SandboxRealm => ({
  fetch: async () => new Response("native"),
  XMLHttpRequest: class NativeXHR extends XMLHttpRequest {},
  location: {
    href: "https://mb.example.com/embed/apps/sales",
    origin: "https://mb.example.com",
  },
});

describe("makeDistortionCallback", () => {
  it("allows style elements for bundled CSS injection", () => {
    const win = fakeWindow();
    const callback = makeDistortionCallback("sales", win, []);
    // The membrane types a distortion as `object -> object`, erasing the call
    // signature of the native ref it replaces — restore it to invoke it.
    const createElement = callback(
      Document.prototype.createElement,
    ) as typeof Document.prototype.createElement;

    expect(() => createElement.call(document, "style")).not.toThrow();
  });

  it("keeps the shared dangerous-tag blocklist for non-style elements", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const win = fakeWindow();
    const callback = makeDistortionCallback("sales", win, []);
    // Same signature erasure as above.
    const createElement = callback(
      Document.prototype.createElement,
    ) as typeof Document.prototype.createElement;

    expect(() => createElement.call(document, "script")).toThrow(
      "[data-app sales] blocked createElement: script",
    );
    consoleErrorSpy.mockRestore();
  });

  it("routes window.fetch to the allowlisted wrapper when allowed_hosts is set", async () => {
    const win = fakeWindow();
    const realFetch = jest.fn(() => Promise.resolve(new Response("ok")));
    win.fetch = realFetch;

    const callback = makeDistortionCallback("sales", win, [
      "https://api.example.com",
    ]);
    // Same signature erasure as above.
    const distorted = callback(win.fetch) as typeof fetch;

    // Not the native fetch — a wrapper that enforces the allowlist.
    expect(distorted).not.toBe(win.fetch);
    await expect(distorted("https://evil.example.org/")).rejects.toThrow(
      /blocked fetch/,
    );
    await distorted("https://api.example.com/data");
    expect(realFetch).toHaveBeenCalledTimes(1);
  });

  it("routes window.XMLHttpRequest to the allowlisted subclass when allowed_hosts is set", () => {
    const win = fakeWindow();
    const callback = makeDistortionCallback("sales", win, [
      "https://api.example.com",
    ]);
    // Same signature erasure as above: the membrane hands the constructor back
    // as a bare `object`.
    const Distorted = callback(win.XMLHttpRequest) as typeof XMLHttpRequest;

    expect(Distorted).not.toBe(win.XMLHttpRequest);
    const xhr = new Distorted();
    expect(() => xhr.open("GET", "https://evil.example.org/")).toThrow(
      /blocked XMLHttpRequest/,
    );
  });

  it("does not wrap fetch/XHR when allowed_hosts is empty (shared hard block stands)", () => {
    const win = fakeWindow();
    const callback = makeDistortionCallback("sales", win, []);
    // No wrapper is installed; the value passes through to the shared callback,
    // whose default-deny block of fetch/XHR is covered by the shared module.
    expect(callback(win.fetch)).toBe(win.fetch);
    expect(callback(win.XMLHttpRequest)).toBe(win.XMLHttpRequest);
  });

  it("delegates non-network values to the shared callback", () => {
    const win = fakeWindow();
    const callback = makeDistortionCallback("sales", win, [
      "https://api.example.com",
    ]);
    const other = { some: "object" };
    expect(callback(other)).toBe(other);
  });

  describe("onBlocked", () => {
    it("reports a blocked API instead of logging it", () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const onBlocked = jest.fn();
      const callback = makeDistortionCallback(
        "sales",
        fakeWindow(),
        [],
        onBlocked,
      );
      // Same signature erasure as above.
      const createElement = callback(
        Document.prototype.createElement,
      ) as typeof Document.prototype.createElement;

      expect(() => createElement.call(document, "script")).toThrow();

      expect(onBlocked).toHaveBeenCalledWith({
        type: "api",
        message: expect.stringContaining("blocked createElement: script"),
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it("reports a blocked fetch with the resolved url and reason", async () => {
      const onBlocked = jest.fn();
      const win = fakeWindow();
      const callback = makeDistortionCallback(
        "sales",
        win,
        ["https://api.example.com"],
        onBlocked,
      );
      // Same signature erasure as above.
      const distorted = callback(win.fetch) as typeof fetch;

      await expect(distorted("https://evil.example.org/")).rejects.toThrow();

      expect(onBlocked).toHaveBeenCalledWith({
        type: "network",
        api: "fetch",
        url: "https://evil.example.org/",
        reason: "evil.example.org (not in allowed_hosts)",
      });
    });

    it("reports a blocked XMLHttpRequest", () => {
      const onBlocked = jest.fn();
      const win = fakeWindow();
      const callback = makeDistortionCallback(
        "sales",
        win,
        ["https://api.example.com"],
        onBlocked,
      );
      // Same signature erasure as above.
      const Distorted = callback(win.XMLHttpRequest) as typeof XMLHttpRequest;

      expect(() =>
        new Distorted().open("GET", "https://evil.example.org/"),
      ).toThrow();

      expect(onBlocked).toHaveBeenCalledWith({
        type: "network",
        api: "xhr",
        url: "https://evil.example.org/",
        reason: "evil.example.org (not in allowed_hosts)",
      });
    });
  });
});
