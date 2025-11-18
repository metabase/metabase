const getDefaultPluginEmbeddingSdk = () => ({
  isEnabled: () => false,
  onBeforeRequestHandlers: {
    getOrRefreshSessionHandler: async () => {},
  },
});

export const PLUGIN_EMBEDDING_SDK = getDefaultPluginEmbeddingSdk();

export function reinitialize() {
  Object.assign(PLUGIN_EMBEDDING_SDK, getDefaultPluginEmbeddingSdk());
}
