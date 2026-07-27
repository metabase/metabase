import { reinitializeEmbeddingSdkRequestHooks } from "metabase/api/client";

const getDefaultPluginEmbeddingSdk = () => ({
  isEnabled: () => false,
});

export const PLUGIN_EMBEDDING_SDK = getDefaultPluginEmbeddingSdk();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_EMBEDDING_SDK, getDefaultPluginEmbeddingSdk());
  // The SDK's request handlers live with the api client (see
  // `embeddingSdkRequestHooks`), but they are still part of this plugin's
  // reset surface.
  reinitializeEmbeddingSdkRequestHooks();
}
