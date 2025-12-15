import type { Dispatch } from "@reduxjs/toolkit";

import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import { createAsyncThunk } from "metabase/lib/redux";

// This is an SDK-only plugin and we co-locate it with its OSS usage for convenience and better three-shaking.
export const PLUGIN_EMBEDDING_SDK_AUTH = {
  initAuth: async (
    _config: any, // should be `MetabaseAuthConfig & { isLocalHost?: boolean }` but we can't import it for now (it's EE code)
    _dispatch: { dispatch: Dispatch },
  ): Promise<void> => {},
  refreshTokenAsync: async (
    _config: any,
    _getState: any,
  ): Promise<any | null> => {
    return null;
  },
};

export const initAuth = createAsyncThunk(
  "sdk/token/INIT_AUTH",
  async (
    authConfig: MetabaseAuthConfig & { isLocalHost?: boolean },
    { dispatch },
  ) => {
    return await PLUGIN_EMBEDDING_SDK_AUTH.initAuth(authConfig, { dispatch });
  },
);

export const refreshTokenAsync = createAsyncThunk(
  "sdk/token/REFRESH_TOKEN",
  async (
    {
      metabaseInstanceUrl,
      preferredAuthMethod,
      jwtProviderUri,
    }: {
      metabaseInstanceUrl: string;
      preferredAuthMethod?: MetabaseAuthConfig["preferredAuthMethod"];
      jwtProviderUri?: string;
    },
    { getState },
  ): Promise<MetabaseEmbeddingSessionToken | null> => {
    return await PLUGIN_EMBEDDING_SDK_AUTH.refreshTokenAsync(
      {
        metabaseInstanceUrl,
        preferredAuthMethod,
        jwtProviderUri,
      },
      { getState },
    );
  },
);
