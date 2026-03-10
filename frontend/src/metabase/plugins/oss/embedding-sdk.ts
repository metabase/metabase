import type { OnBeforeRequestHandlerData } from "metabase/plugins/oss/api";

const getDefaultPluginEmbeddingSdk = () => ({
  isEnabled: () => false,
  onBeforeRequestHandlers: {
    getOrRefreshSessionHandler: async () => {},
    overrideRequestsForGuestEmbeds: async (
      _data: OnBeforeRequestHandlerData,
    ): Promise<OnBeforeRequestHandlerData | void> => {},
  },
});

export const PLUGIN_EMBEDDING_SDK = getDefaultPluginEmbeddingSdk();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_EMBEDDING_SDK, getDefaultPluginEmbeddingSdk());
}
