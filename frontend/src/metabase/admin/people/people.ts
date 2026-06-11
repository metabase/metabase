import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { combineReducers } from "metabase/redux";
import type { TemporaryPasswordsState } from "metabase/redux/store";

const initialState: TemporaryPasswordsState = {};

const temporaryPasswordsSlice = createSlice({
  name: "metabase/admin/people",
  initialState,
  reducers: {
    storeTemporaryPassword: (
      state,
      action: PayloadAction<{ id: number; password: string }>,
    ) => {
      state[action.payload.id] = action.payload.password;
    },
    clearTemporaryPassword: (state, action: PayloadAction<number>) => {
      state[action.payload] = null;
    },
  },
});

export const { storeTemporaryPassword, clearTemporaryPassword } =
  temporaryPasswordsSlice.actions;

export const people = combineReducers({
  temporaryPasswords: temporaryPasswordsSlice.reducer,
});
