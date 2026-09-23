import { PLUGIN_EMBEDDING_SDK_AUTH } from "embedding-sdk-bundle/plugins/auth";
import { PLUGIN_API } from "metabase/api/client";
import { PLUGIN_EMBED_JS_EE } from "metabase/embedding/embedding-iframe-sdk/plugins";
import { reinitialize } from "metabase/plugins";

describe("embedding slot lifecycle", () => {
  beforeEach(reinitialize);

  it("restores the API handler and embedding defaults together", async () => {
    const embeddedHeader = PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader;
    PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader = async () => {};
    const initAuth = jest.fn().mockResolvedValue(undefined);
    PLUGIN_EMBEDDING_SDK_AUTH.initAuth = initAuth;
    Object.assign(PLUGIN_EMBED_JS_EE, { EmbedAuthManager: jest.fn() });

    reinitialize();

    expect(PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader).toBe(
      embeddedHeader,
    );
    expect(PLUGIN_EMBEDDING_SDK_AUTH.initAuth).not.toBe(initAuth);
    expect(PLUGIN_EMBED_JS_EE.EmbedAuthManager).toBeNull();
    await expect(
      PLUGIN_EMBEDDING_SDK_AUTH.refreshTokenAsync(
        { metabaseInstanceUrl: "http://localhost" },
        { getState: () => ({}) },
      ),
    ).resolves.toBeNull();
  });
});
