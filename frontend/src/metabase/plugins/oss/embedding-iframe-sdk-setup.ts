import { definePluginSlot } from "../slot";

const getDefaultPluginEmbeddingIframeSdkSetup = () => ({
  isEnabled: () => false,
});

export const PLUGIN_EMBEDDING_IFRAME_SDK_SETUP = definePluginSlot(
  getDefaultPluginEmbeddingIframeSdkSetup,
);
