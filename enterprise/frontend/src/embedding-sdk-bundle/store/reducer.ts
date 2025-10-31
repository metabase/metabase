import {
  type AsyncThunkAction,
  createAction,
  createReducer,
} from "@reduxjs/toolkit";

import { samlTokenStorage } from "embedding/auth-common";
import type { SdkState, SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type { SdkEventHandlersConfig } from "embedding-sdk-bundle/types/events";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import type {
  MetabaseEmbeddingSessionToken,
  MetabaseFetchRequestTokenFn,
} from "embedding-sdk-bundle/types/refresh-token";
import type {
  SdkErrorComponent,
  SdkLoadingError,
} from "embedding-sdk-bundle/types/ui";
import type { SdkUsageProblem } from "embedding-sdk-bundle/types/usage-problem";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { createAsyncThunk } from "metabase/lib/redux";

import { initAuth, refreshTokenAsync } from "./auth";
import { getSessionTokenState } from "./selectors";
const SET_METABASE_INSTANCE_VERSION = "sdk/SET_METABASE_INSTANCE_VERSION";
const SET_METABASE_CLIENT_URL = "sdk/SET_METABASE_CLIENT_URL";
const SET_LOADER_COMPONENT = "sdk/SET_LOADER_COMPONENT";
const SET_ERROR_COMPONENT = "sdk/SET_ERROR_COMPONENT";
const SET_ERROR = "sdk/SET_ERROR";
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
export const setError = createAction<SdkLoadingError | null>(SET_ERROR);
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
    /**
     * @see {@link https://github.com/metabase/metabase/pull/64238#discussion_r2394229266}
     *
     * TODO: I think this should be called session overall e.g. state.session
     */
    const session = storedAuthToken ?? state?.token;

    const shouldRefreshToken =
      !session ||
      (typeof session?.exp === "number" && session.exp * 1000 < Date.now());
    if (!shouldRefreshToken) {
      return session;
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

const SET_THEME = "sdk/SET_THEME";
const SET_THEME_LOADING = "sdk/SET_THEME_LOADING";
const SET_THEME_ERROR = "sdk/SET_THEME_ERROR";

export const setTheme = createAction<MetabaseTheme | null>(SET_THEME);
export const setThemeLoading = createAction<boolean>(SET_THEME_LOADING);
export const setThemeError = createAction<Error | null>(SET_THEME_ERROR);

const initialState: SdkState = {
  metabaseInstanceUrl: "",
  metabaseInstanceVersion: null,
  token: {
    token: null,
    loading: false,
    error: null,
  },
  loginStatus: { status: "uninitialized" },
  error: null,
  plugins: null,
  eventHandlers: null,
  usageProblem: null,
  loaderComponent: null,
  errorComponent: null,
  fetchRefreshTokenFn: null,
  themeState: {
    theme: null,
    loading: false,
    error: null,
  },
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

  builder.addCase(setError, (state, action) => {
    state.error = action.payload;
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

  builder.addCase(setTheme, (state, action) => {
    state.themeState.theme = action.payload;
    state.themeState.loading = false;
    state.themeState.error = null;
  });

  builder.addCase(setThemeLoading, (state, action) => {
    state.themeState.loading = action.payload;
  });

  builder.addCase(setThemeError, (state, action) => {
    state.themeState.error = action.payload;
    state.themeState.loading = false;
  });
});
