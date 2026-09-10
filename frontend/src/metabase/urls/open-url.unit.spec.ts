import { resetPluginSlots } from "metabase/plugins/slot";

import {
  captureClickModifierKeys,
  getUrlTarget,
  openUrl,
  shouldOpenInBlankWindow,
} from "./open-url";
import { PLUGIN_HOST_NAVIGATION } from "./plugins";

describe("shouldOpenInBlankWindow", () => {
  afterEach(() => {
    resetPluginSlots();
    jest.restoreAllMocks();
  });

  it("should return false for same origin links by default", () => {
    const url = `${window.location.origin}/dashboard/1`;
    const result = shouldOpenInBlankWindow(url);
    expect(result).toBe(false);
  });

  it("should always return true when the host requests a new window", () => {
    PLUGIN_HOST_NAVIGATION.host = {
      handleLink: async () => false,
      sameOriginTarget: "_blank",
    };
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
    resetPluginSlots();
    jest.restoreAllMocks();
  });

  it("should return _self for same origin links by default", () => {
    const url = `${window.location.origin}/dashboard/1`;
    const result = getUrlTarget(url);
    expect(result).toBe("_self");
  });

  it("should always return _blank when the host requests a new window", () => {
    PLUGIN_HOST_NAVIGATION.host = {
      handleLink: async () => false,
      sameOriginTarget: "_blank",
    };
    const url = `${window.location.origin}/dashboard/1`;
    const result = getUrlTarget(url);
    expect(result).toBe("_blank");
  });
});

describe("openUrl()", () => {
  const url = "https://example.com/dashboard/1";

  afterEach(() => {
    resetPluginSlots();
    jest.restoreAllMocks();
  });

  it("should not open the url when the host link handler returns true", async () => {
    const handleLink = jest.fn().mockResolvedValue(true);
    PLUGIN_HOST_NAVIGATION.host = { handleLink, sameOriginTarget: "_blank" };

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();

    await openUrl(url, { openInSameWindow, openInBlankWindow });

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(openInSameWindow).not.toHaveBeenCalled();
    expect(openInBlankWindow).not.toHaveBeenCalled();
  });

  it("should open the url when the host link handler returns false", async () => {
    const handleLink = jest.fn().mockResolvedValue(false);
    PLUGIN_HOST_NAVIGATION.host = { handleLink, sameOriginTarget: "_blank" };

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

describe("host navigation policy", () => {
  afterEach(resetPluginSlots);

  it("opens same-origin links externally without a link interceptor", () => {
    PLUGIN_HOST_NAVIGATION.host = {
      handleLink: null,
      sameOriginTarget: "_blank",
    };
    expect(getUrlTarget(window.location.origin + "/dashboard/1")).toBe(
      "_blank",
    );
  });

  it("intercepts links while keeping same-origin navigation inside the app", async () => {
    const handleLink = jest.fn().mockResolvedValue(false);
    const openInSameOrigin = jest.fn();
    const openInBlankWindow = jest.fn();
    PLUGIN_HOST_NAVIGATION.host = { handleLink, sameOriginTarget: "_self" };
    await openUrl("/dashboard/1", { openInSameOrigin, openInBlankWindow });
    expect(handleLink).toHaveBeenCalled();
    expect(openInSameOrigin).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/dashboard/1" }),
    );
    expect(openInBlankWindow).not.toHaveBeenCalled();
  });

  it("restores the default navigation policy on reset", () => {
    PLUGIN_HOST_NAVIGATION.host = {
      handleLink: null,
      sameOriginTarget: "_blank",
    };
    resetPluginSlots();
    expect(getUrlTarget(window.location.origin + "/dashboard/1")).toBe("_self");
  });
});
