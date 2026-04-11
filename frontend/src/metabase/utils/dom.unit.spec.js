import { setupSdkPlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import {
  getUrlTarget,
  open,
  shouldOpenInBlankWindow,
} from "metabase/utils/dom";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

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

describe("open()", () => {
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

    await open(url, {
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

    await open(url, {
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
      open(url, {
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

    await open(url, {
      openInSameWindow,
      openInBlankWindow,
    });

    expect(handleLink).not.toHaveBeenCalled();
  });
});

describe("open() explicit linkTarget", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses target _blank on the anchor when linkTarget is _blank", async () => {
    await mockIsEmbeddingSdk(false);
    mockSettings({ "site-url": `${window.location.origin}/` });

    const anchors = [];
    const originalCreateElement = document.createElement.bind(document);
    jest
      .spyOn(document, "createElement")
      .mockImplementation((tagName, options) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "a") {
          anchors.push(el);
        }
        return el;
      });

    await open("https://example.com/path", {
      linkTarget: "_blank",
      ignoreSiteUrl: true,
    });

    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors[anchors.length - 1].target).toBe("_blank");
  });

  it("uses openInSameOrigin for in-app links when linkTarget is _self", async () => {
    await mockIsEmbeddingSdk(false);
    mockSettings({ "site-url": `${window.location.origin}/` });
    const openInSameOrigin = jest.fn();

    await open("/dashboard/1", {
      linkTarget: "_self",
      openInSameOrigin,
    });

    expect(openInSameOrigin).toHaveBeenCalled();
  });
});
