import type { OnBeforeRequestHandler } from "metabase/api/client";

const noop: OnBeforeRequestHandler = async () => {};

const getDefaultPluginEmbeddingSdk = () => ({
  isEnabled: () => false,
  onBeforeRequestHandlers: {
    getOrRefreshSessionHandler: noop,
    getOrRefreshGuestSessionHandler: noop,
    overrideRequestsForGuestEmbeds: noop,
    reactSdkEmbedReferrer: noop,
  },
});

export const PLUGIN_EMBEDDING_SDK = getDefaultPluginEmbeddingSdk();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_EMBEDDING_SDK, getDefaultPluginEmbeddingSdk());
}
