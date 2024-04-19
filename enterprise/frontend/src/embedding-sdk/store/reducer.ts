import type { PayloadAction } from "@reduxjs/toolkit";
import { createReducer } from "@reduxjs/toolkit";
import { createAction } from "redux-actions";

import type { SdkState, SdkStoreState } from "embedding-sdk/store/types";
import { createAsyncThunk } from "metabase/lib/redux";

import { getSessionTokenState } from "./selectors";

const SET_IS_LOGGED_IN = "sdk/SET_IS_LOGGED_IN";
const SET_IS_INITIALIZED = "sdk/SET_IS_INITIALIZED";

export const setIsLoggedIn = createAction<boolean>(SET_IS_LOGGED_IN);
export const setIsInitialized = createAction<boolean>(SET_IS_INITIALIZED);

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
    return dispatch(refreshTokenAsync(url));
  },
);

export const refreshTokenAsync = createAsyncThunk(
  REFRESH_TOKEN,
  async (url: string) => {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
    });
    return await response.json();
  },
);

const initialState: SdkState = {
  token: {
    token: null,
    loading: false,
    error: null,
  },
  isLoggedIn: false,
  isInitialized: false,
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
      token: {
        ...state.token,
        token: null,
        error: action.error,
        loading: false,
      },
    };
  },
  [SET_IS_LOGGED_IN]: (state, action: PayloadAction<boolean>) => {
    return {
      ...state,
      isLoggedIn: action.payload,
    };
  },
  [SET_IS_INITIALIZED]: (state, action: PayloadAction<boolean>) => {
    return {
      ...state,
      isInitialized: action.payload,
    };
  },
});
