/* eslint-disable */
import { createReducer } from "@reduxjs/toolkit";
import {
  createAsyncThunk,
  createThunkAction,
} from "metabase/lib/redux/typed-utils";
import type { State } from "metabase-types/store";

export const getSessionToken = (state: State) =>
  state.plugins.embeddingSessionToken;

const GET_OR_REFRESH_SESSION = "metabase/public/GET_OR_REFRESH_SESSION";

export const getOrRefreshSession = createThunkAction(
  GET_OR_REFRESH_SESSION,
  (url: string) => async (_dispatch, getState) => {
    const state = getSessionToken(getState());
    const token = state?.token;

    if (!state?.loading && (!token || token.exp * 1000 < Date.now())) {
      _dispatch(refreshTokenAsync(url));
    }

    return getState().plugins.embeddingSessionToken?.token;
  },
);

const REFRESH_TOKEN = "metabase/public/REFRESH_TOKEN";
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

const initialState = {
  token: null,
  loading: false,
  error: null,
};

const tokenReducer = createReducer(initialState, builder =>
  builder
    .addCase(refreshTokenAsync.pending, state => {
      state.loading = true;
    })
    .addCase(refreshTokenAsync.fulfilled, (state, action) => {
      state.token = action.payload;
      state.loading = false;
    })
    .addCase(refreshTokenAsync.rejected, (state, action) => {
      // @ts-ignore
      state.error = action.error;
      state.loading = false;
    }),
);

export { tokenReducer };
