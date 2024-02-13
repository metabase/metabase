/* eslint-disable */
import { createReducer } from "@reduxjs/toolkit";
import {
  createAsyncThunk,
  createThunkAction,
} from "metabase/lib/redux/typed-utils";
import { createAction } from "metabase/lib/redux";
import type { PublicTokenState, State } from "metabase-types/store";

// selector for the token
export const getSessionToken = (state: State) => state.public;

const GET_OR_REFRESH_SESSION = "metabase/public/GET_OR_REFRESH_SESSION";

export const getOrRefreshSession = createThunkAction(
  GET_OR_REFRESH_SESSION,
  (url: string) => async (_dispatch, getState) => {
    const state = getState().public;
    const token = getState().public?.token;
    console.log("getOrRefreshSession - start");

    console.log(
      "running refresh? ",
      !state?.loading && (!token || token.exp * 1000 < Date.now()),
    );
    if (!state?.loading && (!token || token.exp * 1000 < Date.now())) {
      _dispatch(refreshTokenAsync(url));
    }
    console.log("getOrRefreshSession - end", getState().public?.token);
    return getState().public?.token;
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
