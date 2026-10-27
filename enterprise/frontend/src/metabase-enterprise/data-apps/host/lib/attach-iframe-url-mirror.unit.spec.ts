import { setBasename } from "metabase/utils/basename";

import {
  type UrlMirrorWindow,
  attachIframeUrlMirror,
  mirrorIframePath,
} from "./attach-iframe-url-mirror";

type PopstateArgs = [type: "popstate", listener: () => void];

interface FakeIframeWindow {
  location: { pathname: string };
  history: {
    pushState: jest.Mock<void, unknown[]>;
    replaceState: jest.Mock<void, unknown[]>;
  };
  addEventListener: jest.Mock<void, PopstateArgs>;
  removeEventListener: jest.Mock<void, PopstateArgs>;
}

function fakeIframeWindow(pathname: string): FakeIframeWindow {
  return {
    location: { pathname },
    history: {
      pushState: jest.fn<void, unknown[]>(),
      replaceState: jest.fn<void, unknown[]>(),
    },
    addEventListener: jest.fn<void, PopstateArgs>(),
    removeEventListener: jest.fn<void, PopstateArgs>(),
  };
}

// `FakeIframeWindow` structurally satisfies `UrlMirrorWindow`, so no cast is
// needed at the call sites below.
const asMirrorWindow = (iframe: FakeIframeWindow): UrlMirrorWindow => iframe;

describe("attachIframeUrlMirror", () => {
  // The basename is module-level global state; keep the root-path default clean
  // for every test regardless of what a subpath case set.
  afterEach(() => setBasename(""));

  it("patches the iframe history + popstate on attach and restores them on cleanup", () => {
    const iframe = fakeIframeWindow("/embed/apps/sales");
    const origPush = iframe.history.pushState;
    const origReplace = iframe.history.replaceState;

    const detach = attachIframeUrlMirror(asMirrorWindow(iframe), "sales");

    expect(iframe.history.pushState).not.toBe(origPush);
    expect(iframe.history.replaceState).not.toBe(origReplace);
    expect(iframe.addEventListener).toHaveBeenCalledWith(
      "popstate",
      expect.any(Function),
    );

    detach();

    expect(iframe.history.pushState).toBe(origPush);
    expect(iframe.history.replaceState).toBe(origReplace);
    expect(iframe.removeEventListener).toHaveBeenCalledWith(
      "popstate",
      expect.any(Function),
    );
  });

  it("mirrors the iframe's sub-path into the parent URL on a patched navigation", () => {
    const iframe = fakeIframeWindow("/embed/apps/sales");
    const replaceSpy = jest.spyOn(window.history, "replaceState");

    attachIframeUrlMirror(asMirrorWindow(iframe), "sales");

    // Simulate an in-iframe navigation to a sub-route.
    iframe.location.pathname = "/embed/apps/sales/orders";
    iframe.history.pushState({}, "", "/embed/apps/sales/orders");

    // The parent URL is replaced (not pushed) with the mirrored sub-path.
    const lastCall = replaceSpy.mock.calls.at(-1);
    expect(lastCall?.[2]).toContain("/apps/sales/orders");

    replaceSpy.mockRestore();
  });

  it("preserves the Metabase basename on a subpath install", () => {
    // Subpath install at `/mb`: the iframe `src` is built subpath-safe, so its
    // pathname carries the basename (`/mb/embed/apps/:name/…`).
    setBasename("/mb");
    const iframe = fakeIframeWindow("/mb/embed/apps/sales");
    const replaceSpy = jest.spyOn(window.history, "replaceState");

    attachIframeUrlMirror(asMirrorWindow(iframe), "sales");

    // Navigate to a sub-route inside the iframe.
    iframe.location.pathname = "/mb/embed/apps/sales/orders";
    iframe.history.pushState({}, "", "/mb/embed/apps/sales/orders");

    // The mirrored parent URL keeps both the `/mb` basename and the `/orders`
    // app sub-route — it must not collapse to a bare `/apps/sales`.
    const target = replaceSpy.mock.calls.at(-1)?.[2];
    expect(target).toContain("/mb/apps/sales/orders");
    expect(target).not.toBe("/apps/sales");

    replaceSpy.mockRestore();
  });

  it("does not throw on cleanup when the frame has gone cross-origin", () => {
    const iframe = fakeIframeWindow("/embed/apps/sales");
    const detach = attachIframeUrlMirror(asMirrorWindow(iframe), "sales");

    // A cross-origin frame throws on any window access (like the chrome-error
    // page after a blocked navigation, or a real external host).
    iframe.removeEventListener = jest.fn<void, PopstateArgs>(() => {
      throw new DOMException("Blocked a frame with origin …", "SecurityError");
    });

    expect(() => detach()).not.toThrow();
  });

  it("rethrows unexpected (non-cross-origin) cleanup errors so real bugs surface", () => {
    const iframe = fakeIframeWindow("/embed/apps/sales");
    const detach = attachIframeUrlMirror(asMirrorWindow(iframe), "sales");

    iframe.removeEventListener = jest.fn<void, PopstateArgs>(() => {
      throw new TypeError("boom");
    });

    expect(() => detach()).toThrow("boom");
  });
});

describe("mirrorIframePath", () => {
  beforeEach(() =>
    window.history.replaceState({}, "", "/apps/sales?tab=1#top"),
  );
  afterEach(() => window.history.replaceState({}, "", "/"));

  const mirrored = (iframePath: string) => {
    mirrorIframePath(iframePath, "sales");
    return (
      window.location.pathname + window.location.search + window.location.hash
    );
  };

  it("puts the app's route into the page URL, keeping the page's own query and hash", () => {
    expect(mirrored("/embed/apps/sales/orders/42")).toBe(
      "/apps/sales/orders/42?tab=1#top",
    );
  });

  it("keeps a path that a frame on another origin reports under the app, wherever it points", () => {
    expect(mirrored("/embed/apps/sales/../../auth/logout")).toBe(
      "/apps/sales?tab=1#top",
    );
    expect(mirrored("/embed/apps/sales/%2e%2e/%2E%2E/auth/logout")).toBe(
      "/apps/sales?tab=1#top",
    );
    expect(mirrored("/embed/apps/sales/..\\..\\auth/logout")).toBe(
      "/apps/sales?tab=1#top",
    );
    expect(mirrored("/embed/apps/salesforce/orders")).toBe(
      "/apps/sales?tab=1#top",
    );
    expect(mirrored("http://[")).toBe("/apps/sales?tab=1#top");
  });

  it("ignores a query or fragment in the reported path", () => {
    expect(mirrored("/embed/apps/sales/orders?run=1#q")).toBe(
      "/apps/sales/orders?tab=1#top",
    );
  });
});
