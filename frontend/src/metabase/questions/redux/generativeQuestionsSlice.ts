import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

import type { GenerativeQuestion, GenerativeQuestionsState } from "metabase-types/store/generativeQuestions";

const initialState: GenerativeQuestionsState = {
  questions: {},
  loading: false,
  error: null,
};

const generativeQuestionsSlice = createSlice({
  name: "generativeQuestions",
  initialState,
  reducers: {
    addGenerativeQuestion: (state, action: PayloadAction<GenerativeQuestion>) => {
      state.questions[action.payload.id] = action.payload;
    },
    updateGenerativeQuestion: (state, action: PayloadAction<Partial<GenerativeQuestion> & { id: string }>) => {
      const { id, ...updates } = action.payload;
      if (state.questions[id]) {
        state.questions[id] = {
          ...state.questions[id],
          ...updates,
          updatedAt: Date.now(),
        };
      }
    },
    removeGenerativeQuestion: (state, action: PayloadAction<string>) => {
      delete state.questions[action.payload];
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  addGenerativeQuestion,
  updateGenerativeQuestion,
  removeGenerativeQuestion,
  setLoading,
  setError,
} = generativeQuestionsSlice.actions;

export const generativeQuestionsReducer = generativeQuestionsSlice.reducer;
