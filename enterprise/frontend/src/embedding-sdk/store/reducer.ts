import type { PayloadAction } from "@reduxjs/toolkit";
import { createReducer } from "@reduxjs/toolkit";
import { createAction } from "redux-actions";

import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import type {
  EmbeddingSessionTokenState,
  LoginStatus,
  SdkState,
  SdkStoreState,
} from "embedding-sdk/store/types";
import { createAsyncThunk } from "metabase/lib/redux";

import { getSessionTokenState } from "./selectors";

const SET_LOGIN_STATUS = "sdk/SET_LOGIN_STATUS";
const SET_LOADER_COMPONENT = "sdk/SET_LOADER_COMPONENT";
const SET_ERROR_COMPONENT = "sdk/SET_ERROR_COMPONENT";

export const setLoginStatus = createAction<LoginStatus>(SET_LOGIN_STATUS);
export const setLoaderComponent = createAction<null | (() => JSX.Element)>(
  SET_LOADER_COMPONENT,
);
export const setErrorComponent = createAction<
  null | (({ message }: { message: string }) => JSX.Element)
>(SET_ERROR_COMPONENT);

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
  async (url: string): Promise<EmbeddingSessionTokenState["token"]> => {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
    });
    return await response.json();
  },
);

const SET_PLUGINS = "sdk/SET_PLUGINS";
export const setPlugins = createAction<SdkPluginsConfig | null>(SET_PLUGINS);

const initialState: SdkState = {
  token: {
    token: null,
    loading: false,
    error: null,
  },
  loginStatus: { status: "uninitialized" },
  plugins: null,
  loaderComponent: null,
  errorComponent: null,
};

export const sdk = createReducer(initialState, {
  [refreshTokenAsync.pending.type]: state => {
    return {
      ...state,
      token: {
        ...state.token,
        loading: true,
      },
    };
  },
  [refreshTokenAsync.fulfilled.type]: (state, action) => {
    return {
      ...state,
      token: {
        ...state.token,
        token: action.payload,
        error: null,
        loading: false,
      },
    };
  },
  [refreshTokenAsync.rejected.type]: (state, action) => {
    return {
      ...state,
      isLoggedIn: false,
      token: {
        ...state.token,
        token: null,
        error: action.error,
        loading: false,
      },
    };
  },
  [SET_LOGIN_STATUS]: (state, action: PayloadAction<LoginStatus>) => {
    return {
      ...state,
      loginStatus: action.payload,
    };
  },
  [SET_PLUGINS]: (state, action: PayloadAction<SdkPluginsConfig | null>) => {
    return {
      ...state,
      plugins: action.payload,
    };
  },
  [SET_LOADER_COMPONENT]: (
    state,
    action: PayloadAction<null | (() => JSX.Element)>,
  ) => {
    return {
      ...state,
      loaderComponent: action.payload,
    };
  },
  [SET_ERROR_COMPONENT]: (
    state,
    action: PayloadAction<
      null | (({ message }: { message: string }) => JSX.Element)
    >,
  ) => {
    return {
      ...state,
      errorComponent: action.payload,
    };
  },
});
