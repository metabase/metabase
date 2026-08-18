import type { SdkIframeEmbedSetupModalInitialState } from "metabase/redux/store/modal";

// The modal state vocabulary lives with the store types; re-exported here so
// the plugin barrel stays the public home for the slot's prop types.
export type {
  LegacyStaticEmbeddingModalProps,
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupModalInitialState,
} from "metabase/redux/store/modal";

export type SdkIframeEmbedSetupModalProps = {
  opened: boolean;
  onClose: () => void;
  initialState?: SdkIframeEmbedSetupModalInitialState;
};

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
