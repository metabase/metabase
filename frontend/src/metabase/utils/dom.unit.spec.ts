import { getPathnameWithoutSubPath, initializeFrameSizing } from "./dom";

jest.mock("iframe-resizer/js/iframeResizer.contentWindow.js", () => ({}));

describe("getPathnameWithoutSubPath", () => {
  it("should leave the pathname unchanged when the site url has no subpath", () => {
    expect(
      getPathnameWithoutSubPath("/dashboard/1", "http://example.com"),
    ).toBe("/dashboard/1");
    expect(
      getPathnameWithoutSubPath("/dashboard/1", "http://example.com/"),
    ).toBe("/dashboard/1");
  });

  it("should strip the subpath from the pathname", () => {
    expect(
      getPathnameWithoutSubPath(
        "/metabase/dashboard/1",
        "http://example.com/metabase",
      ),
    ).toBe("/dashboard/1");
  });

  it("should strip the subpath case-insensitively", () => {
    expect(
      getPathnameWithoutSubPath(
        "/Metabase/dashboard/1",
        "http://example.com/metabase",
      ),
    ).toBe("/dashboard/1");
  });

  it("should not strip a subpath that appears mid-pathname", () => {
    expect(
      getPathnameWithoutSubPath(
        "/dashboard/metabase/1",
        "http://example.com/metabase",
      ),
    ).toBe("/dashboard/metabase/1");
  });

  it("should not strip a subpath that only matches a partial path segment", () => {
    expect(
      getPathnameWithoutSubPath(
        "/metabase2/dashboard/1",
        "http://example.com/metabase",
      ),
    ).toBe("/metabase2/dashboard/1");
  });

  it("should leave a pathname shorter than the subpath unchanged", () => {
    expect(
      getPathnameWithoutSubPath("/metabase", "http://example.com/metabase/sub"),
    ).toBe("/metabase");
  });

  it("should leave the pathname unchanged when the site url is empty", () => {
    expect(getPathnameWithoutSubPath("/dashboard/1", "")).toBe("/dashboard/1");
  });
});

describe("initializeFrameSizing", () => {
  let triggerResizeObserver: (() => void) | undefined;
  const OriginalResizeObserver = window.ResizeObserver;

  interface SetupOpts {
    hash?: string;
    isWithinIframe?: boolean;
    supportsRequestResize?: boolean;
  }

  const setup = ({
    hash = "",
    isWithinIframe = true,
    supportsRequestResize = true,
  }: SetupOpts = {}) => {
    window.overrideIsWithinIframe = isWithinIframe;
    window.location.hash = hash;
    const requestResize = jest.fn();
    if (supportsRequestResize) {
      window.requestResize = requestResize;
    }
    const onReady = jest.fn();

    initializeFrameSizing(onReady);

    return { onReady, requestResize };
  };

  beforeEach(() => {
    triggerResizeObserver = undefined;
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        triggerResizeObserver = () => callback([], this);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    window.ResizeObserver = OriginalResizeObserver;
    delete window.requestResize;
    delete window.iFrameResizer;
    delete window.overrideIsWithinIframe;
    window.location.hash = "";
  });

  it("should use native frame sizing when the embed requests it and the browser supports it", () => {
    const { onReady, requestResize } = setup({
      hash: "#frame_sizing=content-height",
    });

    expect(onReady).toHaveBeenCalled();

    triggerResizeObserver?.();
    expect(requestResize).toHaveBeenCalledTimes(1);
  });

  it("should keep the frame scroll when the embed does not request native frame sizing", () => {
    const { onReady } = setup();

    expect(onReady).not.toHaveBeenCalled();
    expect(triggerResizeObserver).toBeUndefined();
  });

  it("should keep the frame scroll when the browser does not support native frame sizing", () => {
    const { onReady } = setup({
      hash: "#frame_sizing=content-height",
      supportsRequestResize: false,
    });

    expect(onReady).not.toHaveBeenCalled();
    expect(triggerResizeObserver).toBeUndefined();
  });

  it("should do nothing outside of an iframe", () => {
    const { onReady } = setup({
      hash: "#frame_sizing=content-height",
      isWithinIframe: false,
    });

    expect(onReady).not.toHaveBeenCalled();
    expect(window.iFrameResizer).toBeUndefined();
  });

  it("should keep supporting iframe-resizer", () => {
    const { onReady } = setup();

    expect(window.iFrameResizer).toEqual(
      expect.objectContaining({ autoResize: true, onReady }),
    );
  });
});
