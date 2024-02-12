/* eslint-disable */
import { createReducer } from "@reduxjs/toolkit";
import { createAsyncThunk } from "metabase/lib/redux/typed-utils";
import { createAction } from "metabase/lib/redux";

const GET_TOKEN = "metabase/public/GET_TOKEN";
const SET_TOKEN = "metabase/public/SET_TOKEN";
const REFRESH_TOKEN = "metabase/public/REFRESH_TOKEN";
export const getToken = createAction(GET_TOKEN);
export const setToken = createAction(SET_TOKEN);
export const refreshToken = createAction(REFRESH_TOKEN);

// Async action example using createAsyncThunk for refreshing token
export const refreshTokenAsync = createAsyncThunk(
  REFRESH_TOKEN,
  async (_, { dispatch }) => {
    const response = await fetch("http://localhost:8081/sso/metabase", {
      method: "GET",
      credentials: "include",
    });
    const data = await response.json();
    dispatch(setToken(data));

    return data;
  },
);

const initialState = {
  token: null,
  loading: false,
  error: null,
};

const tokenReducer = createReducer(initialState, {
  [GET_TOKEN]: (state, action) => {
    // No actual logic needed just to "get" the token, included for demonstration
  },
  [SET_TOKEN]: (state, action) => {
    console.log("SET_TOKEN", action);
    state.token = action.payload;
  },
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
