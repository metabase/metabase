import { attachIframeUrlMirror } from "./attach-iframe-url-mirror";

type FakeIframeWindow = {
  location: { pathname: string };
  history: {
    pushState: (...args: unknown[]) => void;
    replaceState: (...args: unknown[]) => void;
  };
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
};

function fakeIframeWindow(pathname: string): FakeIframeWindow {
  return {
    location: { pathname },
    history: { pushState: jest.fn(), replaceState: jest.fn() },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
}

describe("attachIframeUrlMirror", () => {
  it("patches the iframe history + popstate on attach and restores them on cleanup", () => {
    const iframe = fakeIframeWindow("/embed/data-app/sales");
    const origPush = iframe.history.pushState;
    const origReplace = iframe.history.replaceState;

    const detach = attachIframeUrlMirror(iframe as unknown as Window, "sales");

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
    const iframe = fakeIframeWindow("/embed/data-app/sales");
    const replaceSpy = jest.spyOn(window.history, "replaceState");

    attachIframeUrlMirror(iframe as unknown as Window, "sales");

    // Simulate an in-iframe navigation to a sub-route.
    iframe.location.pathname = "/embed/data-app/sales/orders";
    iframe.history.pushState({}, "", "/embed/data-app/sales/orders");

    // The parent URL is replaced (not pushed) with the mirrored sub-path.
    const lastCall = replaceSpy.mock.calls.at(-1);
    expect(lastCall?.[2]).toContain("/data-app/sales/orders");

    replaceSpy.mockRestore();
  });

  it("does not throw on cleanup when the frame has gone cross-origin", () => {
    const iframe = fakeIframeWindow("/embed/data-app/sales");
    const detach = attachIframeUrlMirror(iframe as unknown as Window, "sales");

    // A cross-origin frame throws on any window access (like the chrome-error
    // page after a blocked navigation, or a real external host).
    iframe.removeEventListener = jest.fn(() => {
      throw new DOMException("Blocked a frame with origin …", "SecurityError");
    });

    expect(() => detach()).not.toThrow();
  });
});
