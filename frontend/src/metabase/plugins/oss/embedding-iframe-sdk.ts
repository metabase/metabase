import { definePluginSlot } from "../slot";

const getDefaultPluginEmbeddingIframeSdk = () => ({
  isEnabled: () => false,
});

export const PLUGIN_EMBEDDING_IFRAME_SDK = definePluginSlot(
  getDefaultPluginEmbeddingIframeSdk,
);
