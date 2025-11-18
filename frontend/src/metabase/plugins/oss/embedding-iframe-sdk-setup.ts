import type { ReactNode } from "react";

export type SdkIframeEmbedSetupModalProps = {
  opened: boolean;
  onClose: () => void;
  initialState?: SdkIframeEmbedSetupModalInitialState;
};

export type SdkIframeEmbedSetupModalInitialState = {
  resourceType?: string | null;
  resourceId?: string | number | null;
  useExistingUserSession?: boolean;
};

const getDefaultPluginEmbeddingIframeSdkSetup = () => ({
  isFeatureEnabled: () => false,
  shouldShowEmbedInNewItemMenu: () => false,
  SdkIframeEmbedSetupModal: (
    _props: SdkIframeEmbedSetupModalProps,
  ): ReactNode => null,
});

export const PLUGIN_EMBEDDING_IFRAME_SDK_SETUP =
  getDefaultPluginEmbeddingIframeSdkSetup();

export function reinitialize() {
  Object.assign(
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP,
    getDefaultPluginEmbeddingIframeSdkSetup(),
  );
}
