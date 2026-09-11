import { PLUGIN_API } from "metabase/api/client";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

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
});
