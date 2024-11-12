import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import type {
  MetabotChatContext,
  MetabotHistory,
  MetabotReaction,
} from "metabase-types/api";

import { sendMessageRequest } from "./actions";

export interface MetabotState {
  isProcessing: boolean;
  userMessages: string[];
  confirmationOptions: Record<string, MetabotReaction[]> | undefined;
  lastSentContext: MetabotChatContext | undefined;
  lastHistoryValue: MetabotHistory | undefined;
  visible: boolean;
}

export const metabotInitialState: MetabotState = {
  isProcessing: false,
  userMessages: [],
  confirmationOptions: undefined,
  lastSentContext: undefined,
  lastHistoryValue: undefined,
  visible: false,
};

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState: metabotInitialState,
  reducers: {
    addUserMessage: (state, action: PayloadAction<string>) => {
      state.userMessages.push(action.payload);
    },
    clearUserMessages: state => {
      state.userMessages = [];
    },
    dismissUserMessage: (state, action: PayloadAction<number>) => {
      state.userMessages.splice(action.payload, 1);
    },
    setIsProcessing: (state, action: PayloadAction<boolean>) => {
      state.isProcessing = action.payload;
    },
    setVisible: (state, { payload: visible }: PayloadAction<boolean>) => {
      state.visible = visible;

      if (!visible) {
        state.isProcessing = false;
        state.userMessages = [];
        state.confirmationOptions = undefined;
        state.lastSentContext = undefined;
        state.lastHistoryValue = undefined;
      }
    },
    setConfirmationOptions: (
      state,
      action: PayloadAction<Record<string, MetabotReaction[]> | undefined>,
    ) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      state.confirmationOptions = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(sendMessageRequest.pending, (state, action) => {
        state.lastSentContext = action.meta.arg.context;
        state.lastHistoryValue = action.meta.arg.history;
      })
      .addCase(sendMessageRequest.fulfilled, (state, action) => {
        state.lastHistoryValue = action.payload?.data?.history;
      });
  },
});

export const metabotReducer = metabot.reducer;
