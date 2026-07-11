import { setupSdkPlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import * as dom from "metabase/utils/dom";
import {
  getUrlTarget,
  openUrl,
  shouldOpenInBlankWindow,
} from "metabase/visualizations/lib/open-url";
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

// A custom click-behavior destination that points at a public link or embed
// resource must use a full-page navigation, not client-side routing: the public
// and embed apps are served from separate route bundles, so client-side
// navigation lands on a blank/incorrect page. (metabase#38640)
describe("openUrl() - public link / embed destinations (metabase#38640)", () => {
  const origin = window.location.origin;

  beforeEach(async () => {
    await mockIsEmbeddingSdk(false);
    mockSettings({ "site-url": origin });
    jest.spyOn(dom, "clickLink").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ["public link", `${origin}/public/dashboard/1a2b3c`],
    ["embed", `${origin}/embed/dashboard/some.jwt.token`],
  ])(
    "uses full-page navigation (not client-side routing) for a %s URL",
    async (_label, url) => {
      const openInSameOrigin = jest.fn();
      const openInSameWindow = jest.fn();
      const openInBlankWindow = jest.fn();

      await openUrl(url, {
        openInSameOrigin,
        openInSameWindow,
        openInBlankWindow,
      });

      // client-side navigation must NOT be used for these routes
      expect(openInSameOrigin).not.toHaveBeenCalled();
      // instead a real anchor click (full-page navigation) is performed
      expect(dom.clickLink).toHaveBeenCalledWith(url, false);
    },
  );

  it("uses client-side navigation for an ordinary in-app URL", async () => {
    const openInSameOrigin = jest.fn();
    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();
    const url = `${origin}/dashboard/1`;

    await openUrl(url, {
      openInSameOrigin,
      openInSameWindow,
      openInBlankWindow,
    });

    expect(openInSameOrigin).toHaveBeenCalledTimes(1);
    expect(dom.clickLink).not.toHaveBeenCalled();
  });
});
