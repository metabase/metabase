import type { OnBeforeRequestHandler } from "metabase/api/client";

const noop: OnBeforeRequestHandler = async () => {};

const getDefaultPluginEmbeddingIframeSdk = () => ({
  isEnabled: () => false,
  onBeforeRequestHandlers: {
    embedReferrer: noop,
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
