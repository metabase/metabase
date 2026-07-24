import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import type { ExplorationsState } from "metabase/redux/store/explorations";
import type { Exploration } from "metabase-types/api";

const initialState: ExplorationsState = {
  currentExploration: undefined,
};

const explorationsSlice = createSlice({
  name: "explorations",
  initialState,
  reducers: {
    setCurrentExploration: (
      state,
      action: PayloadAction<Exploration | undefined>,
    ) => {
      // @ts-expect-error - possibly infinite type error
      state.currentExploration = action.payload;
    },
  },
});

export const { setCurrentExploration } = explorationsSlice.actions;

export const explorationsReducer = explorationsSlice.reducer;
