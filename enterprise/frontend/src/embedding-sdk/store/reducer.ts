import { createReducer } from "@reduxjs/toolkit";

import type {
  EmbeddingSessionTokenState,
  SdkState,
} from "embedding-sdk/store/types";
import { createAsyncThunk } from "metabase/lib/redux";

const initialState: EmbeddingSessionTokenState = {
  token: null,
  loading: false,
  error: null,
};

export const getSessionTokenState = (state: SdkState) =>
  state.embeddingSessionToken;

const GET_OR_REFRESH_SESSION = "embeddingSessionToken/GET_OR_REFRESH_SESSION";

export const getOrRefreshSession = createAsyncThunk(
  GET_OR_REFRESH_SESSION,
  async (url: string, { dispatch, getState }) => {
    const state = getSessionTokenState(getState() as SdkState);
    const token = state?.token;

    const isTokenValid = token && token.exp * 1000 >= Date.now();

    if (state.loading || isTokenValid) {
      return token;
    }
    return dispatch(refreshTokenAsync(url));
  },
);

const REFRESH_TOKEN = "embeddingSessionToken/REFRESH_TOKEN";

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

const tokenReducer = createReducer(initialState, builder =>
  builder
    .addCase(refreshTokenAsync.pending, state => {
      state.loading = true;
      return state;
    })
    .addCase(refreshTokenAsync.fulfilled, (state, action) => {
      state.token = action.payload;
      state.error = null;
      state.loading = false;
      return state;
    })
    .addCase(refreshTokenAsync.rejected, (state, action) => {
      state.token = null;
      state.error = action.error;
      state.loading = false;
      return state;
    }),
);

export { tokenReducer };
