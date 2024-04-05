/* eslint-disable */
import { createReducer } from "@reduxjs/toolkit";
import {
  createAsyncThunk,
  createThunkAction,
} from "metabase/lib/redux/typed-utils";
import type { State } from "metabase-types/store";

const initialState = {
  token: null,
  loading: false,
  error: null,
};

export const getSessionToken = (state: State) =>
  state.plugins.embeddingSessionToken;

const GET_OR_REFRESH_SESSION = "metabase/public/GET_OR_REFRESH_SESSION";

export const getOrRefreshSession = createThunkAction(
  GET_OR_REFRESH_SESSION,
  (url: string) => async (_dispatch, getState) => {
    const state = getSessionToken(getState());
    const token = state?.token;

    console.log({state, token})

    console.log(!state?.loading, !token || token.exp * 1000 < Date.now());

    if (!state?.loading && (!token || token.exp * 1000 < Date.now())) {
      _dispatch(refreshTokenAsync(url));
    }

    console.log(getState().plugins.embeddingSessionToken);

    return getState().plugins.embeddingSessionToken;
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
    const res = await response.json()
    console.log(res);
    return res
  },
);

const tokenReducer = createReducer(initialState, {
    // @ts-ignore
    [refreshTokenAsync.pending]: (state, action) => {
        console.log("action pending", action);
        state.loading = true;
    },
    // @ts-ignore
    [refreshTokenAsync.fulfilled]: (state, action) => {
        console.log("action fulfilled", { state, action });
        state.token = action.payload;
        state.loading = false;
    },
    // @ts-ignore
    [refreshTokenAsync.rejected]: (state, action) => {
        console.log("action rejected", action);
        state.error = action.error;
        state.loading = false;
    },
});

export { tokenReducer };
