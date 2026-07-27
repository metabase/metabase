import { reinitializeEmbeddingIframeSdkRequestHooks } from "metabase/api/client";

const getDefaultPluginEmbeddingIframeSdk = () => ({
  isEnabled: () => false,
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
  // The iframe SDK's request handlers live with the api client (see
  // `embeddingIframeSdkRequestHooks`), but they are still part of this
  // plugin's reset surface.
  reinitializeEmbeddingIframeSdkRequestHooks();
}
