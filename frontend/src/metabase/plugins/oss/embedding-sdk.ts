import { definePluginSlot } from "../slot";

const getDefaultPluginEmbeddingSdk = () => ({
  isEnabled: () => false,
});

export const PLUGIN_EMBEDDING_SDK = definePluginSlot(
  getDefaultPluginEmbeddingSdk,
);
