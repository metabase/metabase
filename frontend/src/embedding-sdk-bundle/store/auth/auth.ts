import { PLUGIN_EMBEDDING_SDK_AUTH } from "embedding-sdk-bundle/plugins/auth";
import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import { createAsyncThunk } from "metabase/redux/utils";

const createSdkAsyncThunk = createAsyncThunk.withTypes<{
  state: SdkStoreState;
  extra: void;
}>();

export const initAuth = createSdkAsyncThunk(
  "sdk/token/INIT_AUTH",
  async (
    authConfig: MetabaseAuthConfig & { isLocalHost?: boolean },
    { dispatch },
  ) => {
    return await PLUGIN_EMBEDDING_SDK_AUTH.initAuth(authConfig, { dispatch });
  },
);

export const refreshTokenAsync = createSdkAsyncThunk(
  "sdk/token/REFRESH_TOKEN",
  async (
    config: MetabaseAuthConfig,
    { getState },
  ): Promise<MetabaseEmbeddingSessionToken | null> => {
    return await PLUGIN_EMBEDDING_SDK_AUTH.refreshTokenAsync(config, {
      getState,
    });
  },
);
