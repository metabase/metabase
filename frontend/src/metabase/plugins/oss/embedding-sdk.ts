import { definePluginSlot } from "metabase/plugin-slots";

const getDefaultPluginEmbeddingSdk = () => ({
  isEnabled: () => false,
});

export const PLUGIN_EMBEDDING_SDK = definePluginSlot(
  getDefaultPluginEmbeddingSdk,
);
