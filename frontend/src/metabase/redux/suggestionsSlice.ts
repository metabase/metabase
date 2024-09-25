import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { State } from "metabase-types/store";

interface SuggestionsState {
    suggestions: any;
}
const initialState: SuggestionsState = {
    suggestions: null
};

const suggestionsSlice = createSlice({
  name: "suggestions",
  initialState,
  reducers: {
    setSuggestions(state, action: PayloadAction<SuggestionsState>) {
      state.suggestions = action.payload
    },
    clearSuggestions(state) {
      state.suggestions = null;
    },
  },
});

export const { setSuggestions, clearSuggestions } = suggestionsSlice.actions;

export const suggestionsReducer = suggestionsSlice.reducer;

export const getSuggestions = (state: State) => state.suggestions;
