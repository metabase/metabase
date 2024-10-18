import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { metabotAgent } from "metabase-enterprise/api";
import type { ChatMessage, MetabotMessage } from "metabase-types/api";

export interface MetabotState {
  chatHistory: ChatMessage[];
}

const initialState: MetabotState = {
  chatHistory: [],
};

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<MetabotMessage>) => {
      state.chatHistory.push(action.payload);
    },
    reset: () => initialState,
  },
  extraReducers: builder => {
    builder.addMatcher(metabotAgent.matchPending, (state, action) => {
      const args = action.meta.arg.originalArgs;
      state.chatHistory.push({
        source: "user",
        message: args.message,
        context: args.context,
      });
    });
  },
});

export const metabotReducer = metabot.reducer;
