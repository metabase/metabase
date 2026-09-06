import { resetHostLinkHandler, setHostLinkHandler } from "./host-navigation";
import {
  captureClickModifierKeys,
  getUrlTarget,
  openUrl,
  shouldOpenInBlankWindow,
} from "./open-url";

describe("shouldOpenInBlankWindow", () => {
  afterEach(() => {
    resetHostLinkHandler();
    jest.restoreAllMocks();
  });

  it("should return false for same origin links by default", () => {
    const url = `${window.location.origin}/dashboard/1`;
    const result = shouldOpenInBlankWindow(url);
    expect(result).toBe(false);
  });

  it("should always return true when a host link handler is installed", () => {
    setHostLinkHandler(async () => false);
    const url = `${window.location.origin}/dashboard/1`;
    const result = shouldOpenInBlankWindow(url);
    expect(result).toBe(true);
  });
});

describe("captureClickModifierKeys", () => {
  const url = `${window.location.origin}/dashboard/1`;

  function mouseUp(metaKey: boolean) {
    window.dispatchEvent(new MouseEvent("mouseup", { metaKey }));
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Runs before any test in this file calls captureClickModifierKeys,
  // since the listener stays registered.
  it("should ignore the last click's modifier keys until it is called", () => {
    mouseUp(true);
    expect(shouldOpenInBlankWindow(url, { event: null })).toBe(false);
  });

  it("should register one mouseup listener and read the last click's modifier keys", () => {
    const addEventListener = jest.spyOn(window, "addEventListener");
    captureClickModifierKeys();
    captureClickModifierKeys();
    expect(addEventListener).toHaveBeenCalledTimes(1);

    mouseUp(true);
    expect(shouldOpenInBlankWindow(url, { event: null })).toBe(true);
    mouseUp(false);
    expect(shouldOpenInBlankWindow(url, { event: null })).toBe(false);
  });
});

describe("getUrlTarget", () => {
  afterEach(() => {
    resetHostLinkHandler();
    jest.restoreAllMocks();
  });

  it("should return _self for same origin links by default", () => {
    const url = `${window.location.origin}/dashboard/1`;
    const result = getUrlTarget(url);
    expect(result).toBe("_self");
  });

  it("should always return _blank when a host link handler is installed", () => {
    setHostLinkHandler(async () => false);
    const url = `${window.location.origin}/dashboard/1`;
    const result = getUrlTarget(url);
    expect(result).toBe("_blank");
  });
});

describe("openUrl()", () => {
  const url = "https://example.com/dashboard/1";

  afterEach(() => {
    resetHostLinkHandler();
    jest.restoreAllMocks();
  });

  it("should not open the url when the host link handler returns true", async () => {
    const handleLink = jest.fn().mockResolvedValue(true);
    setHostLinkHandler(handleLink);

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();

    await openUrl(url, { openInSameWindow, openInBlankWindow });

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(openInSameWindow).not.toHaveBeenCalled();
    expect(openInBlankWindow).not.toHaveBeenCalled();
  });

  it("should open the url when the host link handler returns false", async () => {
    const handleLink = jest.fn().mockResolvedValue(false);
    setHostLinkHandler(handleLink);

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();

    await openUrl(url, { openInSameWindow, openInBlankWindow });

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(openInBlankWindow).toHaveBeenCalledWith(url);
  });

  it("should open the url when no host link handler is installed", async () => {
    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();

    await openUrl(url, { openInSameWindow, openInBlankWindow });

    expect(openInSameWindow).not.toHaveBeenCalled();
    expect(openInBlankWindow).toHaveBeenCalledWith(url);
  });
});
