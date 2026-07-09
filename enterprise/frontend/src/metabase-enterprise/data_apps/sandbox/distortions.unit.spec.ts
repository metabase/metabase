import { makeDistortionCallback } from "./distortions";

// A minimal stand-in for the iframe window the data-app sandbox is built on.
// `fetch`/`XMLHttpRequest` are the native refs the membrane passes to the
// distortion callback; `makeDistortionCallback` should route those to the
// allowlist wrappers and delegate everything else to the shared callback.
const fakeWindow = () =>
  ({
    fetch: function nativeFetch() {},
    XMLHttpRequest: class NativeXHR {},
    location: {
      href: "https://mb.example.com/embed/apps/sales",
      origin: "https://mb.example.com",
    },
  }) as unknown as Window & typeof globalThis;

describe("makeDistortionCallback", () => {
  it("allows style elements for bundled CSS injection", () => {
    const win = fakeWindow();
    const callback = makeDistortionCallback("sales", win, []);
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
    win.fetch = realFetch as unknown as typeof fetch;

    const callback = makeDistortionCallback("sales", win, [
      "https://api.example.com",
    ]);
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
});
