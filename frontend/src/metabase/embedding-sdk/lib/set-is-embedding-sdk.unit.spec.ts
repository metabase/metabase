import type { OnBeforeRequestHandlerConfig } from "metabase/api/client";
import { PLUGIN_API, reinitializeRequestHandlers } from "metabase/api/client";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

import { setIsEmbeddingSdk } from "./set-is-embedding-sdk";

const REQUEST: OnBeforeRequestHandlerConfig = {
  method: "GET",
  url: "/api/health",
  data: {},
};

const runEmbeddedHeaderHandler = () =>
  PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader(REQUEST);

describe("setIsEmbeddingSdk", () => {
  const originalConfig = { ...EMBEDDING_SDK_CONFIG };

  afterEach(() => {
    Object.assign(EMBEDDING_SDK_CONFIG, originalConfig);
    delete window.overrideIsWithinIframe;
    reinitializeRequestHandlers();
  });

  it("should turn on SDK mode", () => {
    setIsEmbeddingSdk();

    expect(EMBEDDING_SDK_CONFIG.isEmbeddingSdk).toBe(true);
  });

  it("should stop tagging requests as embedded when the SDK runs inside an iframe", async () => {
    window.overrideIsWithinIframe = true;

    expect(await runEmbeddedHeaderHandler()).toEqual({
      headers: { "X-Metabase-Embedded": "true" },
    });

    setIsEmbeddingSdk();

    expect(await runEmbeddedHeaderHandler()).toBeUndefined();
  });
});
