const getDefaultPluginEmbeddingIframeSdkSetup = () => ({
  isEnabled: () => false,
});

export const PLUGIN_EMBEDDING_IFRAME_SDK_SETUP =
  getDefaultPluginEmbeddingIframeSdkSetup();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP,
    getDefaultPluginEmbeddingIframeSdkSetup(),
  );
}
