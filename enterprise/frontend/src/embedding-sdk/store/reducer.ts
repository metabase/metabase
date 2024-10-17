import { createAction, createReducer } from "@reduxjs/toolkit";

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

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return value;
  }
};

export const refreshTokenAsync = createAsyncThunk(
  REFRESH_TOKEN,
  async (url: string, { getState }): Promise<EmbeddingSessionToken | null> => {
    // The SDK user can provide a custom function to refresh the token.
    const getRefreshToken =
      getFetchRefreshTokenFn(getState() as SdkStoreState) ??
      defaultGetRefreshTokenFn;

    try {
      // getRefreshToken is possibly user-provided, we should handle *any* error it could throw
      // We should throw an error inside this try-catch, the catch will handle it by re-throwing (to make the thunk reject),
      // logging it and making sure it's an `Error`
      const response = await getRefreshToken(url);

      // if not an object throw right away, something is 100% wrong
      if (!response || typeof response !== "object") {
        const message = `"fetchRequestToken" must return an object with the shape {id:string, exp:number, iat:number, status:string}, got ${safeStringify(response)} instead`;

        throw new Error(message);
      }
      if ("status" in response && response.status !== "ok") {
        if ("message" in response && typeof response.message === "string") {
          // For some errors, the BE gives us a message that explain it
          throw new Error(response.message);
        }
        if ("status" in response && typeof response.status === "string") {
          // other times it just returns an error code
          throw new Error(
            `Failed to refresh token, got status: ${response.status}`,
          );
        }
      }

      if (!("status" in response) || !("id" in response)) {
        const message = `"fetchRequestToken" must return an object with the shape {id:string, exp:number, iat:number, status:string}, got ${safeStringify(response)} instead`;

        throw new Error(message);
      }
      return response;
    } catch (ex: unknown) {
      // redux catches thrown errors to dispatch the .rejected action, we need to log them manually to show them in the browser console
      // {cause: ex } makes the console show the original stack trace
      console.error(new Error("Failed to refresh token.", { cause: ex }));

      throw ex;
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

  builder.addCase(refreshTokenAsync.fulfilled, (state, action) => {
    state.token = {
      token: action.payload,
      loading: false,
      error: null,
    };

    state.loginStatus = { status: "success" };
  });

  builder.addCase(refreshTokenAsync.rejected, (state, action) => {
    const error = action.error as Error;
    state.loginStatus = { status: "error", error };
  });

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
