import type { ReactNode } from "react";

const getDefaultPluginEmbeddingIframeSdk = () => ({
  hasValidLicense: () => false,
  SdkIframeEmbedRoute: (): ReactNode => null,
});

export const PLUGIN_EMBEDDING_IFRAME_SDK = getDefaultPluginEmbeddingIframeSdk();

export function reinitialize() {
  Object.assign(
    PLUGIN_EMBEDDING_IFRAME_SDK,
    getDefaultPluginEmbeddingIframeSdk(),
  );
}
