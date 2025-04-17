import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { logout } from "metabase/auth/actions";
import { uuid } from "metabase/lib/uuid";
import type { MetabotChatContext, MetabotHistory } from "metabase-types/api";

import { sendMessageRequest } from "./actions";

export interface MetabotState {
  isProcessing: boolean;
  lastSentContext: MetabotChatContext | undefined;
  lastHistoryValue: MetabotHistory | undefined;
  conversationId: string | undefined;
  userMessages: string[];
  visible: boolean;
  state: any;
}

export const metabotInitialState: MetabotState = {
  isProcessing: false,
  lastSentContext: undefined,
  lastHistoryValue: undefined,
  conversationId: undefined,
  userMessages: [],
  visible: false,
  state: {},
};

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState: metabotInitialState,
  reducers: {
    addUserMessage: (state, action: PayloadAction<string>) => {
      state.userMessages.push(action.payload);
    },
    clearUserMessages: (state) => {
      state.userMessages = [];
    },
    dismissUserMessage: (state, action: PayloadAction<number>) => {
      state.userMessages.splice(action.payload, 1);
    },
    resetConversationId: (state) => {
      state.conversationId = uuid();
    },
    setIsProcessing: (state, action: PayloadAction<boolean>) => {
      state.isProcessing = action.payload;
    },
    setVisible: (state, { payload: visible }: PayloadAction<boolean>) => {
      if (visible) {
        state.visible = true;
        state.conversationId = uuid();
      } else {
        return metabotInitialState;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendMessageRequest.pending, (state, action) => {
        state.lastSentContext = action.meta.arg.context;
        state.lastHistoryValue = action.meta.arg.history;
      })
      .addCase(sendMessageRequest.fulfilled, (state, action) => {
        state.lastHistoryValue = action.payload?.data?.history;
      })
      .addCase(logout.pending, () => metabotInitialState);
  },
});

export const metabotReducer = metabot.reducer;
