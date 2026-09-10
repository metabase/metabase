import fetchMock from "fetch-mock";

import type { OnBeforeRequestHandlerConfig } from "metabase/api/client";
import { ApiClient, PLUGIN_API } from "metabase/api/client";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { resetPluginSlots } from "metabase/plugins/slot";

import { enterSdkMode } from "./enter-sdk-mode";

const REQUEST: OnBeforeRequestHandlerConfig = {
  method: "GET",
  url: "/api/health",
  data: {},
};

describe("enterSdkMode", () => {
  const originalConfig = { ...EMBEDDING_SDK_CONFIG };

  afterEach(() => {
    Object.assign(EMBEDDING_SDK_CONFIG, originalConfig);
    delete window.overrideIsWithinIframe;
    resetPluginSlots();
  });

  it("enables SDK mode", () => {
    enterSdkMode();

    expect(EMBEDDING_SDK_CONFIG.isEmbeddingSdk).toBe(true);
  });

  it("omits the embedded header for SDK requests inside an iframe", async () => {
    window.overrideIsWithinIframe = true;

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST),
    ).toEqual({
      headers: { "X-Metabase-Embedded": "true" },
    });

    enterSdkMode();

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST),
    ).toBeUndefined();
  });

  it("reinstalls the opt-out after a reset, even if SDK mode is already true", async () => {
    window.overrideIsWithinIframe = true;
    enterSdkMode();
    resetPluginSlots();

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST),
    ).toEqual({
      headers: { "X-Metabase-Embedded": "true" },
    });

    enterSdkMode();

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST),
    ).toBeUndefined();
  });

  it("keeps the opt-out when initialized repeatedly", async () => {
    window.overrideIsWithinIframe = true;
    enterSdkMode();

    enterSdkMode();

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST),
    ).toBeUndefined();
  });

  it("preserves client and authentication headers inside an iframe", async () => {
    window.overrideIsWithinIframe = true;
    fetchMock.get("path:/api/health", { body: { status: "ok" } });
    PLUGIN_API.onBeforeRequestHandlers.setRequestClientHeaders = async () => ({
      headers: { "X-Metabase-Client": "embedding-sdk-react" },
    });
    PLUGIN_API.onBeforeRequestHandlers.setEmbeddingRequestAuthHeaders =
      async () => ({
        headers: { "X-Metabase-Session": "test-session" },
      });
    enterSdkMode();

    await new ApiClient().request({ method: "GET", url: "/api/health" });

    const request = fetchMock.callHistory.lastCall("path:/api/health");
    expect(request).toBeDefined();
    const headers = new Headers(request?.options.headers);
    expect(headers.get("X-Metabase-Embedded")).toBeNull();
    expect(headers.get("X-Metabase-Client")).toBe("embedding-sdk-react");
    expect(headers.get("X-Metabase-Session")).toBe("test-session");
  });
});
