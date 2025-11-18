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

export const PLUGIN_EMBEDDING_IFRAME_SDK_SETUP = {
  isFeatureEnabled: () => false,
  shouldShowEmbedInNewItemMenu: () => false,
  SdkIframeEmbedSetupModal: (
    _props: SdkIframeEmbedSetupModalProps,
  ): ReactNode => null,
};
