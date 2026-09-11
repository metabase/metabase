import type { OnBeforeRequestHandlerConfig } from "metabase/api/client";
import { PLUGIN_API } from "metabase/api/client";
import {
  EMBEDDING_SDK_CONFIG,
  isDataAppDev,
} from "metabase/embedding-sdk/config";

import { isEmbedPreview, setDataApp } from "./config";
import { setRequestClientHeaders } from "./lib/auth/set-request-client-headers";

const iframeState = { iframedInSelf: false, withinIframe: false };

jest.mock("metabase/utils/iframe", () => ({
  get IFRAMED_IN_SELF() {
    return iframeState.iframedInSelf;
  },
  isWithinIframe: () => iframeState.withinIframe,
}));

const REQUEST: OnBeforeRequestHandlerConfig = {
  method: "GET",
  url: "/api/health",
  data: {},
};

describe("setDataApp", () => {
  const originalConfig = { ...EMBEDDING_SDK_CONFIG };
  const originalHandlers = { ...PLUGIN_API.onBeforeRequestHandlers };

  afterEach(() => {
    Object.assign(EMBEDDING_SDK_CONFIG, originalConfig);
    Object.assign(PLUGIN_API.onBeforeRequestHandlers, originalHandlers);
    iframeState.iframedInSelf = false;
    iframeState.withinIframe = false;
  });

  it("configures the data-app context on the shared config", () => {
    setDataApp("sales");

    expect(EMBEDDING_SDK_CONFIG.isDataApp).toBe(true);
    expect(EMBEDDING_SDK_CONFIG.isDataAppDev).toBe(false);
    expect(EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader).toBe("data-app");
    expect(EMBEDDING_SDK_CONFIG.metabaseClientRequestIdentifier).toBe("sales");
  });

  it("installs a handler that sends the data-app client and identifier headers", async () => {
    setDataApp("sales");

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setRequestClientHeaders(REQUEST),
    ).toEqual({
      headers: {
        "X-Metabase-Client": "data-app",
        "X-Metabase-Client-Identifier": "sales",
      },
    });
  });

  it("omits the identifier header when the app name is unknown", async () => {
    setDataApp("");

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setRequestClientHeaders(REQUEST),
    ).toEqual({ headers: { "X-Metabase-Client": "data-app" } });
  });

  it("does not send the embed-preview header for a non-dev data app", async () => {
    setDataApp("sales");

    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbedPreviewHeader(REQUEST),
    ).toBeUndefined();
  });

  it("sends the embed-preview header for a dev data app, so it is recorded as data-app-preview", async () => {
    setDataApp("sales", { isDev: true });

    expect(isDataAppDev()).toBe(true);
    expect(
      await PLUGIN_API.onBeforeRequestHandlers.setEmbedPreviewHeader(REQUEST),
    ).toEqual({ headers: { "X-Metabase-Embedded-Preview": "true" } });
  });

  it("keeps the same headers when the SDK re-installs the handler from the config", async () => {
    // `useInitData` (run by every SDK component's ComponentProvider) replaces
    // the handler slot with one built from EMBEDDING_SDK_CONFIG. It must
    // produce the same headers, or mounting an SDK component silently drops
    // the data-app attribution.
    setDataApp("sales");

    const installed =
      await PLUGIN_API.onBeforeRequestHandlers.setRequestClientHeaders(REQUEST);
    const reinstalled = await setRequestClientHeaders({
      name: EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      identifier: EMBEDDING_SDK_CONFIG.metabaseClientRequestIdentifier,
    })(REQUEST);

    expect(reinstalled).toEqual(installed);
  });
});

describe("isEmbedPreview", () => {
  const originalConfig = { ...EMBEDDING_SDK_CONFIG };

  afterEach(() => {
    Object.assign(EMBEDDING_SDK_CONFIG, originalConfig);
    iframeState.iframedInSelf = false;
  });

  it("is true when the page is iframed into itself", () => {
    iframeState.iframedInSelf = true;

    expect(isEmbedPreview()).toBe(true);
  });

  it("is false for a data app, which is always iframed into Metabase", () => {
    iframeState.iframedInSelf = true;
    EMBEDDING_SDK_CONFIG.isDataApp = true;

    expect(isEmbedPreview()).toBe(false);
  });

  it("is false outside an iframe", () => {
    expect(isEmbedPreview()).toBe(false);
  });
});
