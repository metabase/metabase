import { setupSdkPlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import {
  captureClickModifierKeys,
  getUrlTarget,
  openUrl,
  shouldOpenInBlankWindow,
} from "./open-url";

describe("shouldOpenInBlankWindow", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return false for same origin links by default", () => {
    const url = `${window.location.origin}/dashboard/1`;
    const result = shouldOpenInBlankWindow(url);
    expect(result).toBe(false);
  });

  it("should always return true when in embedding SDK", async () => {
    await mockIsEmbeddingSdk();
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
    jest.restoreAllMocks();
  });

  it("should return _self for same origin links by default", () => {
    const url = `${window.location.origin}/dashboard/1`;
    const result = getUrlTarget(url);
    expect(result).toBe("_self");
  });

  it("should always return _blank when in the embedding SDK", async () => {
    await mockIsEmbeddingSdk();
    const url = `${window.location.origin}/dashboard/1`;
    const result = getUrlTarget(url);
    expect(result).toBe("_blank");
  });
});

describe("openUrl()", () => {
  beforeEach(async () => {
    await mockIsEmbeddingSdk();
    // Ensure a clean store before each test
    ensureMetabaseProviderPropsStore().cleanup();

    mockSettings({
      "token-features": createMockTokenFeatures({ embedding_sdk: true }),
    });
    setupSdkPlugins();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    ensureMetabaseProviderPropsStore().cleanup();
  });

  it("should prevent default behavior when handleLink returns { handled: true }", async () => {
    const handleLink = jest.fn().mockReturnValue({ handled: true });
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();
    const url = "https://example.com/dashboard/1";

    await openUrl(url, {
      openInSameWindow,
      openInBlankWindow,
    });

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(openInSameWindow).not.toHaveBeenCalled();
    expect(openInBlankWindow).not.toHaveBeenCalled();
  });

  it("should allow default behavior when handleLink returns { handled: false }", async () => {
    const handleLink = jest.fn().mockReturnValue({ handled: false });
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();
    const url = "https://example.com/dashboard/1";

    await openUrl(url, {
      openInSameWindow,
      openInBlankWindow,
    });

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(openInBlankWindow).toHaveBeenCalledWith(url);
  });

  it("should throw error when handleLink returns invalid value", async () => {
    const handleLink = jest.fn().mockReturnValue(true);
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();
    const url = "https://example.com/dashboard/1";

    await expect(
      openUrl(url, {
        openInSameWindow,
        openInBlankWindow,
      }),
    ).rejects.toThrow(
      "handleLink plugin must return an object with a 'handled' property",
    );

    expect(handleLink).toHaveBeenCalledWith(url);
  });

  it("should not call handleLink when not in embedding SDK", async () => {
    await mockIsEmbeddingSdk(false);
    const handleLink = jest.fn();
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();
    const url = "https://example.com/dashboard/1";

    await openUrl(url, {
      openInSameWindow,
      openInBlankWindow,
    });

    expect(handleLink).not.toHaveBeenCalled();
  });
});

describe("openUrl() with a URL on the Metabase origin", () => {
  const { origin } = window.location;

  function setup({ siteUrl }: { siteUrl: string }) {
    mockSettings({ "site-url": siteUrl });
    const clickedLinks: { href: string; target: string }[] = [];
    jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedLinks.push({ href: this.href, target: this.target });
      });
    const openInSameOrigin = jest.fn();
    const openInSameWindow = jest.fn();

    return { clickedLinks, openInSameOrigin, openInSameWindow };
  }

  beforeEach(async () => {
    await mockIsEmbeddingSdk(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("navigates in the app to an in-app URL under the site URL path", async () => {
    const { clickedLinks, openInSameOrigin, openInSameWindow } = setup({
      siteUrl: `${origin}/subpath`,
    });

    await openUrl(`${origin}/subpath/dashboard/1?a=1`, {
      openInSameOrigin,
      openInSameWindow,
      ignoreSiteUrl: true,
    });

    expect(openInSameOrigin).toHaveBeenCalledTimes(1);
    expect(openInSameOrigin).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/dashboard/1", search: "?a=1" }),
    );
    expect(openInSameWindow).not.toHaveBeenCalled();
    expect(clickedLinks).toEqual([]);
  });

  it("loads a URL outside the site URL path as a full page instead of an in-app route (metabase#33379)", async () => {
    const { clickedLinks, openInSameOrigin, openInSameWindow } = setup({
      siteUrl: `${origin}/subpath`,
    });
    const url = `${origin}/404`;

    await openUrl(url, {
      openInSameOrigin,
      openInSameWindow,
      ignoreSiteUrl: true,
    });

    expect(openInSameOrigin).not.toHaveBeenCalled();
    expect(openInSameWindow).not.toHaveBeenCalled();
    expect(clickedLinks).toEqual([{ href: url, target: "" }]);
  });

  it("loads a public link as a full page instead of an in-app route (metabase#38640)", async () => {
    const { clickedLinks, openInSameOrigin, openInSameWindow } = setup({
      siteUrl: origin,
    });
    const url = `${origin}/public/dashboard/a-public-uuid`;

    await openUrl(url, {
      openInSameOrigin,
      openInSameWindow,
      ignoreSiteUrl: true,
    });

    expect(openInSameOrigin).not.toHaveBeenCalled();
    expect(openInSameWindow).not.toHaveBeenCalled();
    expect(clickedLinks).toEqual([{ href: url, target: "" }]);
  });
});
