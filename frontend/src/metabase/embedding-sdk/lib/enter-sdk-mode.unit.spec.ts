import fetchMock from "fetch-mock";

import type { OnBeforeRequestHandlerConfig } from "metabase/api/client";
import { ApiClient, PLUGIN_API } from "metabase/api/client";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { resetPluginSlots } from "metabase/plugin-slots";

import { enterSdkMode } from "./enter-sdk-mode";

const REQUEST: OnBeforeRequestHandlerConfig = {
  method: "GET",
  url: "/api/health",
  data: {},
};

const runEmbeddedHeaderHandler = () =>
  PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST);

describe("enterSdkMode", () => {
  const originalConfig = { ...EMBEDDING_SDK_CONFIG };

  afterEach(() => {
    Object.assign(EMBEDDING_SDK_CONFIG, originalConfig);
    delete window.overrideIsWithinIframe;
    resetPluginSlots();
  });

  it("should stop tagging requests as embedded when the SDK runs inside an iframe", async () => {
    window.overrideIsWithinIframe = true;

    expect(await runEmbeddedHeaderHandler()).toEqual({
      headers: { "X-Metabase-Embedded": "true" },
    });

    enterSdkMode();

    expect(await runEmbeddedHeaderHandler()).toBeUndefined();
  });
  it("reinstalls the opt-out after a reset, even if SDK mode is already true", async () => {
    window.overrideIsWithinIframe = true;
    enterSdkMode();
    resetPluginSlots();
    expect(await runEmbeddedHeaderHandler()).toEqual({
      headers: { "X-Metabase-Embedded": "true" },
    });
    enterSdkMode();
    enterSdkMode();
    expect(await runEmbeddedHeaderHandler()).toBeUndefined();
  });
  it("keeps client and authentication headers on real SDK requests inside an iframe", async () => {
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

    const headers = new Headers(
      fetchMock.callHistory.lastCall()?.options.headers,
    );
    expect(headers.get("X-Metabase-Embedded")).toBeNull();
    expect(headers.get("X-Metabase-Client")).toBe("embedding-sdk-react");
    expect(headers.get("X-Metabase-Session")).toBe("test-session");
  });
});
