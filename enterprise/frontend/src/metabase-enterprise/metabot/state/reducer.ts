import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { logout } from "metabase/auth/actions";
import { uuid } from "metabase/lib/uuid";
import type { MetabotChatContext } from "metabase-types/api";

import { sendMessageRequest } from "./actions";

export interface MetabotState {
  isProcessing: boolean;
  lastSentContext: MetabotChatContext | undefined;
  conversationId: string | undefined;
  messages: Array<{ actor: "user" | "agent"; message: string }>;
  visible: boolean;
  state: any;
}

export const metabotInitialState: MetabotState = {
  isProcessing: false,
  lastSentContext: undefined,
  conversationId: undefined,
  messages: [],
  visible: false,
  state: {},
};

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState: metabotInitialState,
  reducers: {
    addUserMessage: (state, action: PayloadAction<string>) => {
      state.messages.push({ actor: "user", message: action.payload });
    },
    addAgentMessage: (state, action: PayloadAction<string>) => {
      state.messages.push({ actor: "agent", message: action.payload });
    },
    clearMessages: (state) => {
      state.messages = [];
    },
    resetConversationId: (state) => {
      state.conversationId = uuid();
    },
    setIsProcessing: (state, action: PayloadAction<boolean>) => {
      state.isProcessing = action.payload;
    },
    setVisible: (state, action: PayloadAction<boolean>) => {
      state.visible = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendMessageRequest.pending, (state, action) => {
        state.lastSentContext = action.meta.arg.context;
      })
      .addCase(logout.pending, () => metabotInitialState);
  },
});

export const metabotReducer = metabot.reducer;
