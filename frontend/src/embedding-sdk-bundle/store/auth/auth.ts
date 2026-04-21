import type { MetabaseAuthConfig } from "metabase/embedding/sdk-bundle/types/auth-config";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import { PLUGIN_EMBEDDING_SDK_AUTH } from "metabase/plugins";
import { createAsyncThunk } from "metabase/utils/redux";

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
