/* eslint-disable */
import { createReducer } from "@reduxjs/toolkit";
import { createAsyncThunk } from "metabase/lib/redux/typed-utils";
import { createAction } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

// selector for the token
export const getSessionToken = (state: State) => state.public.token?.id;

const REFRESH_TOKEN = "metabase/public/REFRESH_TOKEN";
export const refreshTokenAsync = createAsyncThunk(
  REFRESH_TOKEN,
  async (url: string, { dispatch }) => {
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
  // [GET_TOKEN]: (state, action) => {
  //   No actual logic needed just to "get" the token, included for demonstration
  // },
  // [SET_TOKEN]: (state, action) => {
  //   console.log("SET_TOKEN", action);
  //   state.token = action.payload;
  // },
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
