export type OnBeforeRequestHandlerData = {
  method: "GET" | "POST";
  url: string;
  options: {
    headers?: Record<string, string>;
    hasBody: boolean;
  } & Record<string, unknown>;
};

export type OnBeforeRequestHandler = (
  data: OnBeforeRequestHandlerData,
) => Promise<void | OnBeforeRequestHandlerData>;

const getDefaultPluginEmbeddingSdk = () => ({
  isEnabled: () => false,
  onBeforeRequestHandlers: {
    getOrRefreshSessionHandler: async () => {},
    overrideRequestsForGuestEmbeds: async (
      _data: OnBeforeRequestHandlerData,
    ): Promise<OnBeforeRequestHandlerData | void> => {},
  },
});

export const PLUGIN_EMBEDDING_SDK = getDefaultPluginEmbeddingSdk();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_EMBEDDING_SDK, getDefaultPluginEmbeddingSdk());
}
