import type { Dispatch } from "@reduxjs/toolkit";

function getDefaultPluginEmbeddingSdkAuth() {
  return {
    initAuth: async (
      _config: any,
      _dispatch: { dispatch: Dispatch },
    ): Promise<void> => {},
    refreshTokenAsync: async (
      _config: any,
      _getState: any,
    ): Promise<any | null> => {
      return null;
    },
  };
}

export const PLUGIN_EMBEDDING_SDK_AUTH = getDefaultPluginEmbeddingSdkAuth();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_EMBEDDING_SDK_AUTH, getDefaultPluginEmbeddingSdkAuth());
}
