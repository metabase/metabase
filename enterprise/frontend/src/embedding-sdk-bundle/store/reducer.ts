import {
  type AsyncThunkAction,
  createAction,
  createReducer,
} from "@reduxjs/toolkit";

import { isSessionTokenValid, samlTokenStorage } from "embedding/auth-common";
import type { SdkState, SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type { SdkEventHandlersConfig } from "embedding-sdk-bundle/types/events";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import type {
  MetabaseEmbeddingSessionToken,
  MetabaseFetchRequestTokenFn,
} from "embedding-sdk-bundle/types/refresh-token";
import type { SdkErrorComponent } from "embedding-sdk-bundle/types/ui";
import type { SdkUsageProblem } from "embedding-sdk-bundle/types/usage-problem";
import { createAsyncThunk } from "metabase/lib/redux";

import { initAuth, refreshTokenAsync } from "./auth";
import { getSessionTokenState } from "./selectors";
const SET_METABASE_INSTANCE_VERSION = "sdk/SET_METABASE_INSTANCE_VERSION";
const SET_METABASE_CLIENT_URL = "sdk/SET_METABASE_CLIENT_URL";
const SET_LOADER_COMPONENT = "sdk/SET_LOADER_COMPONENT";
const SET_ERROR_COMPONENT = "sdk/SET_ERROR_COMPONENT";
const SET_FETCH_REQUEST_TOKEN_FN = "sdk/SET_FETCH_REQUEST_TOKEN_FN";

export const setMetabaseInstanceVersion = createAction<string>(
  SET_METABASE_INSTANCE_VERSION,
);
export const setMetabaseClientUrl = createAction<string>(
  SET_METABASE_CLIENT_URL,
);
export const setLoaderComponent = createAction<null | (() => JSX.Element)>(
  SET_LOADER_COMPONENT,
);
export const setErrorComponent = createAction<null | SdkErrorComponent>(
  SET_ERROR_COMPONENT,
);
export const setFetchRefreshTokenFn =
  createAction<null | MetabaseFetchRequestTokenFn>(SET_FETCH_REQUEST_TOKEN_FN);

const GET_OR_REFRESH_SESSION = "sdk/token/GET_OR_REFRESH_SESSION";

let refreshTokenPromise: ReturnType<
  AsyncThunkAction<MetabaseEmbeddingSessionToken | null, unknown, any>
> | null = null;

export const getOrRefreshSession = createAsyncThunk(
  GET_OR_REFRESH_SESSION,
  async (
    authConfig: Pick<
      MetabaseAuthConfig,
      "metabaseInstanceUrl" | "preferredAuthMethod"
    >,
    { dispatch, getState },
  ) => {
    // necessary to ensure that we don't use a popup every time the user
    // refreshes the page
    const storedAuthToken = samlTokenStorage.get();
    const state = getSessionTokenState(getState() as SdkStoreState);
    const token = storedAuthToken ?? state?.token;

    if (isSessionTokenValid(token)) {
      return token;
    }

    if (refreshTokenPromise) {
      return refreshTokenPromise.unwrap();
    }

    refreshTokenPromise = dispatch(refreshTokenAsync(authConfig));
    refreshTokenPromise.finally(() => {
      refreshTokenPromise = null;
    });

    return refreshTokenPromise.unwrap();
  },
);

const SET_PLUGINS = "sdk/SET_PLUGINS";
export const setPlugins = createAction<MetabasePluginsConfig | null>(
  SET_PLUGINS,
);

const SET_EVENT_HANDLERS = "sdk/SET_EVENT_HANDLERS";
export const setEventHandlers = createAction<SdkEventHandlersConfig | null>(
  SET_EVENT_HANDLERS,
);

const SET_USAGE_PROBLEM = "sdk/SET_USAGE_PROBLEM";
export const setUsageProblem = createAction<SdkUsageProblem | null>(
  SET_USAGE_PROBLEM,
);

const initialState: SdkState = {
  metabaseInstanceUrl: "",
  metabaseInstanceVersion: null,
  token: {
    token: null,
    loading: false,
    error: null,
  },
  loginStatus: { status: "uninitialized" },
  plugins: null,
  eventHandlers: null,
  usageProblem: null,
  loaderComponent: null,
  errorComponent: null,
  fetchRefreshTokenFn: null,
};

export const sdk = createReducer(initialState, (builder) => {
  builder.addCase(refreshTokenAsync.pending, (state) => {
    state.token = { ...state.token, loading: true };
  });

  builder.addCase(refreshTokenAsync.fulfilled, (state, action) => {
    state.token = {
      token: action.payload,
      loading: false,
      error: null,
    };
  });

  builder.addCase(refreshTokenAsync.rejected, (state, action) => {
    const error = action.error as Error;
    state.loginStatus = { status: "error", error };
  });

  builder.addCase(initAuth.pending, (state) => {
    state.loginStatus = { status: "loading" };
  });

  builder.addCase(initAuth.fulfilled, (state) => {
    state.loginStatus = { status: "success" };
  });

  builder.addCase(initAuth.rejected, (state, action) => {
    const error = action.error as Error;
    state.loginStatus = { status: "error", error };
  });

  builder.addCase(setLoaderComponent, (state, action) => {
    state.loaderComponent = action.payload;
  });

  builder.addCase(setPlugins, (state, action) => {
    // At the time of writing, doing `this.state.plugins = action.payload` causes
    // `Type instantiation is excessively deep and possibly infinite.` for
    // this specific action, but it fixes the others.
    return { ...state, plugins: action.payload };
  });

  builder.addCase(setEventHandlers, (state, action) => {
    state.eventHandlers = action.payload;
  });

  builder.addCase(setErrorComponent, (state, action) => {
    state.errorComponent = action.payload;
  });

  builder.addCase(setMetabaseInstanceVersion, (state, action) => {
    state.metabaseInstanceVersion = action.payload;
  });

  builder.addCase(setMetabaseClientUrl, (state, action) => {
    state.metabaseInstanceUrl = action.payload;
  });

  builder.addCase(setFetchRefreshTokenFn, (state, action) => {
    state.fetchRefreshTokenFn = action.payload;
  });

  builder.addCase(setUsageProblem, (state, action) => {
    state.usageProblem = action.payload;
  });
});
