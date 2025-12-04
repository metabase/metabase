import type { ReactNode } from "react";

const getDefaultPluginEmbeddingIframeSdk = () => ({
  hasValidLicense: () => false,
  SdkIframeEmbedRoute: (): ReactNode => null,
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
