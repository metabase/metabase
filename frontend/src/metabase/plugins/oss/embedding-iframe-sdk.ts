import type { OnBeforeRequestHandlerConfig } from "metabase/api/client";

const getDefaultPluginEmbeddingIframeSdk = () => ({
  isEnabled: () => false,
  onBeforeRequestHandlers: {
    embedReferrer: async (
      _data: OnBeforeRequestHandlerConfig,
    ): Promise<Partial<OnBeforeRequestHandlerConfig> | void> => {},
  },
});

export const PLUGIN_EMBEDDING_IFRAME_SDK = getDefaultPluginEmbeddingIframeSdk();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(
    PLUGIN_EMBEDDING_IFRAME_SDK,
    getDefaultPluginEmbeddingIframeSdk(),
  );
}
