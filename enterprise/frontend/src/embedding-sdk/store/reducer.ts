import { createAction, createReducer } from "@reduxjs/toolkit";
import { t } from "ttag";

import type { EmbeddingSessionToken, FetchRequestTokenFn } from "embedding-sdk";
import type { SdkEventHandlersConfig } from "embedding-sdk/lib/events";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { defaultGetRefreshTokenFn } from "embedding-sdk/store/refresh-token";
import type {
  LoginStatus,
  SdkErrorComponent,
  SdkState,
  SdkStoreState,
} from "embedding-sdk/store/types";
import type { SdkUsageProblem } from "embedding-sdk/types/usage-problem";
import { createAsyncThunk } from "metabase/lib/redux";

import { getFetchRefreshTokenFn, getSessionTokenState } from "./selectors";

const SET_LOGIN_STATUS = "sdk/SET_LOGIN_STATUS";
const SET_METABASE_CLIENT_URL = "sdk/SET_METABASE_CLIENT_URL";
const SET_LOADER_COMPONENT = "sdk/SET_LOADER_COMPONENT";
const SET_ERROR_COMPONENT = "sdk/SET_ERROR_COMPONENT";
const SET_FETCH_REQUEST_TOKEN_FN = "sdk/SET_FETCH_REQUEST_TOKEN_FN";

export const setLoginStatus = createAction<LoginStatus>(SET_LOGIN_STATUS);
export const setMetabaseClientUrl = createAction<string>(
  SET_METABASE_CLIENT_URL,
);
export const setLoaderComponent = createAction<null | (() => JSX.Element)>(
  SET_LOADER_COMPONENT,
);
export const setErrorComponent = createAction<null | SdkErrorComponent>(
  SET_ERROR_COMPONENT,
);
export const setFetchRefreshTokenFn = createAction<null | FetchRequestTokenFn>(
  SET_FETCH_REQUEST_TOKEN_FN,
);

const GET_OR_REFRESH_SESSION = "sdk/token/GET_OR_REFRESH_SESSION";
const REFRESH_TOKEN = "sdk/token/REFRESH_TOKEN";

export const getOrRefreshSession = createAsyncThunk(
  GET_OR_REFRESH_SESSION,
  async (url: string, { dispatch, getState }) => {
    const state = getSessionTokenState(getState() as SdkStoreState);
    const token = state?.token;

    const isTokenValid = token && token.exp * 1000 >= Date.now();

    if (state.loading || isTokenValid) {
      return token;
    }

    return dispatch(refreshTokenAsync(url)).unwrap();
  },
);

export const refreshTokenAsync = createAsyncThunk(
  REFRESH_TOKEN,
  async (url: string, { getState }): Promise<EmbeddingSessionToken | null> => {
    // The SDK user can provide a custom function to refresh the token.
    const getRefreshToken =
      getFetchRefreshTokenFn(getState() as SdkStoreState) ??
      defaultGetRefreshTokenFn;

    try {
      return await getRefreshToken(url);
    } catch (errorCause) {
      // As this function can be supplied by the SDK user,
      // we have to handle possible errors in refreshing the token.
      const error = new Error(t`failed to refresh the auth token`);
      error.cause = errorCause;

      setLoginStatus({ status: "error", error });

      return null;
    }
  },
);

const SET_PLUGINS = "sdk/SET_PLUGINS";
export const setPlugins = createAction<SdkPluginsConfig | null>(SET_PLUGINS);

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

export const sdk = createReducer(initialState, builder => {
  builder.addCase(refreshTokenAsync.pending, state => ({
    ...state,
    token: { ...state.token, loading: true },
  }));

  builder.addCase(refreshTokenAsync.fulfilled, (state, action) => ({
    ...state,
    token: {
      ...state.token,
      token: action.payload,
      error: null,
      loading: false,
    },
  }));

  builder.addCase(refreshTokenAsync.rejected, (state, action) => ({
    ...state,
    isLoggedIn: false,
    token: {
      ...state.token,
      token: null,
      error: action.error,
      loading: false,
    },
  }));

  builder.addCase(setLoginStatus, (state, action) => ({
    ...state,
    loginStatus: action.payload,
  }));

  builder.addCase(setLoaderComponent, (state, action) => ({
    ...state,
    loaderComponent: action.payload,
  }));

  builder.addCase(setPlugins, (state, action) => ({
    ...state,
    plugins: action.payload,
  }));

  builder.addCase(setEventHandlers, (state, action) => ({
    ...state,
    eventHandlers: action.payload,
  }));

  builder.addCase(setErrorComponent, (state, action) => ({
    ...state,
    errorComponent: action.payload,
  }));

  builder.addCase(setMetabaseClientUrl, (state, action) => ({
    ...state,
    metabaseInstanceUrl: action.payload,
  }));

  builder.addCase(setFetchRefreshTokenFn, (state, action) => ({
    ...state,
    fetchRefreshTokenFn: action.payload,
  }));

  builder.addCase(setUsageProblem, (state, action) => ({
    ...state,
    usageProblem: action.payload,
  }));
});
