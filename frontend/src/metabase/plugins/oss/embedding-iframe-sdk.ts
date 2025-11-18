import type { ReactNode } from "react";

export const PLUGIN_EMBEDDING_IFRAME_SDK = {
  hasValidLicense: () => false,
  SdkIframeEmbedRoute: (): ReactNode => null,
};
