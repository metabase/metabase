import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

import type {
  EmbeddingSessionTokenState,
  SdkState,
  SdkStoreState,
} from "embedding-sdk/store/types";
import { createAsyncThunk } from "metabase/lib/redux";

import { getSessionTokenState } from "./selectors";

const GET_OR_REFRESH_SESSION = "sdk/token/GET_OR_REFRESH_SESSION";
const REFRESH_TOKEN = "sdk/token/REFRESH_TOKEN";

export const getOrRefreshSession = createAsyncThunk(
  GET_OR_REFRESH_SESSION,
  async (
    url: string,
    { dispatch, getState },
  ): Promise<EmbeddingSessionTokenState["token"] | null> => {
    const state = getSessionTokenState(getState() as SdkStoreState);
    const token = state?.token;

    const isTokenValid = token && token.exp * 1000 >= Date.now();

    if (state.loading || isTokenValid) {
      return token;
    }
    return await dispatch(refreshTokenAsync(url)).unwrap();
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

export const sdkSlice = createSlice({
  name: "sdk",
  initialState,
  reducers: {
    setIsLoggedIn(state, action: PayloadAction<boolean>) {
      state.isLoggedIn = action.payload;
    },
    setIsInitialized(state, action: PayloadAction<boolean>) {
      state.isInitialized = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(refreshTokenAsync.pending, state => {
        state.token.loading = true;
      })
      .addCase(refreshTokenAsync.fulfilled, (state, action) => {
        state.token.token = action.payload;
        state.token.error = null;
        state.token.loading = false;
      })
      .addCase(refreshTokenAsync.rejected, (state, action) => {
        state.isLoggedIn = false;
        state.token.token = null;
        state.token.error = action.error;
        state.token.loading = false;
      });
  },
});

export const { setIsLoggedIn, setIsInitialized } = sdkSlice.actions;
export const sdk = sdkSlice.reducer;
