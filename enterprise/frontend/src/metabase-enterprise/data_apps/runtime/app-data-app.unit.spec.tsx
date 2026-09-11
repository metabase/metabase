import { PLUGIN_API } from "metabase/api/client";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { getUrlTarget, openUrl } from "metabase/urls";

jest.mock("react-dom/client", () => ({
  createRoot: () => ({ render: jest.fn() }),
}));

jest.mock("embedding-sdk-bundle/sdk-bundle-exports", () => ({
  sdkBundleExports: {},
}));

jest.mock("./components/DataAppIframeApp/DataAppIframeApp", () => ({
  DataAppIframeApp: () => null,
}));

describe("data-app iframe entry", () => {
  const originalConfig = { ...EMBEDDING_SDK_CONFIG };

  afterEach(() => {
    Object.assign(EMBEDDING_SDK_CONFIG, originalConfig);
    delete window.overrideIsWithinIframe;
    document.body.innerHTML = "";
  });

  it("should enter SDK mode when it loads", async () => {
    window.overrideIsWithinIframe = true;
    document.body.innerHTML = '<div id="root"></div>';

    await import("./app-data-app");

    expect(EMBEDDING_SDK_CONFIG.isEmbeddingSdk).toBe(true);
    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader({
        method: "GET",
        url: "/api/health",
        data: {},
      }),
    ).toBeUndefined();
  });

  it("should open a same-origin link outside the data-app iframe", async () => {
    await import("./app-data-app");

    const url = window.location.origin + "/dashboard/1";
    const openInBlankWindow = jest.fn();
    const openInSameOrigin = jest.fn();
    await openUrl(url, { openInBlankWindow, openInSameOrigin });

    expect(getUrlTarget(url)).toBe("_blank");
    expect(openInBlankWindow).toHaveBeenCalledWith(url);
    expect(openInSameOrigin).not.toHaveBeenCalled();
  });
});
