import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { State } from "metabase-types/store";

interface InitialMessageState {
  message: string;
}

const initialState: InitialMessageState = {
  message: "", // Default initial message
};

const initialMessageSlice = createSlice({
  name: "initialMessage",
  initialState,
  reducers: {
    setInitialMessage(state, action: PayloadAction<string>) {
      state.message = action.payload;
    },
    clearInitialMessage(state) {
      state.message = "";
    },
  },
});

// Export the actions to be used in components
export const { setInitialMessage, clearInitialMessage } =
  initialMessageSlice.actions;

// Export the reducer to be included in the store
export const initialMessageReducer = initialMessageSlice.reducer;

// Selector to get the initialMessage state
export const getInitialMessage = (state: State) => state.initialMessage;
