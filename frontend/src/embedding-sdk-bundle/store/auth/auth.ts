/* eslint-disable @typescript-eslint/no-unsafe-return -- FIXME: any-typed values */
import type { Dispatch } from "@reduxjs/toolkit";

import { recordSdkPageMark } from "embedding-sdk-bundle/analytics/sdk-first-component-performance/event";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import { createAsyncThunk } from "metabase/redux/utils";

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
  getOrRefreshSession: async (
    _config: MetabaseAuthConfig,
    _store: SdkStore,
  ): Promise<MetabaseEmbeddingSessionToken | null> => null,
};

export const initAuth = createAsyncThunk(
  "sdk/token/INIT_AUTH",
  async (
    authConfig: MetabaseAuthConfig & { isLocalHost?: boolean },
    { dispatch },
  ) => {
    const bootstrapAuthStartMs =
      getWindow()?.METABASE_EMBEDDING_SDK_AUTH_STATE?.startedAtMs;
    recordSdkPageMark("init_start", bootstrapAuthStartMs ?? performance.now());
    await PLUGIN_EMBEDDING_SDK_AUTH.initAuth(authConfig, { dispatch });
    recordSdkPageMark("init_end");
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
