import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import type { ChatMessage, MetabotAgentChatContext } from "metabase-types/api";

export interface MetabotState {
  chat: {
    history: ChatMessage[];
    context: MetabotAgentChatContext;
  };
}

const initialState = {
  chat: {
    history: [],
    context: {},
  },
} satisfies MetabotState as MetabotState;

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.chat.history.push(action.payload);
    },
  },
});

export const metabotReducer = metabot.reducer;
