import { createSlice } from "@reduxjs/toolkit";

export interface EntityBackButtonState {
  destination: { model: string; id: number; name: string } | null;
}

const initialState: EntityBackButtonState = {
  destination: null,
};

const entityBackButtonSlice = createSlice({
  name: "entityBackButton",
  initialState,
  reducers: {
    setBackNavigation: (state, action) => {
      state.destination = action.payload;
    },
    clearBackNavigation: (state) => {
      state.destination = null;
    },
  },
});

export const { setBackNavigation, clearBackNavigation } =
  entityBackButtonSlice.actions;

export const entityBackButtonReducer = entityBackButtonSlice.reducer;
