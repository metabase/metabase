import type { OnBeforeRequestHandlerConfig } from "metabase/plugins/oss/api";

const getDefaultPluginEmbeddingSdk = () => ({
  isEnabled: () => false,
  onBeforeRequestHandlers: {
    getOrRefreshSessionHandler: async () => {},
    getOrRefreshGuestSessionHandler: async (
      _data: OnBeforeRequestHandlerConfig,
    ): Promise<OnBeforeRequestHandlerConfig | void> => {},
    overrideRequestsForGuestEmbeds: async (
      _data: OnBeforeRequestHandlerConfig,
    ): Promise<OnBeforeRequestHandlerConfig | void> => {},
  },
});

export const PLUGIN_EMBEDDING_SDK = getDefaultPluginEmbeddingSdk();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_EMBEDDING_SDK, getDefaultPluginEmbeddingSdk());
}
