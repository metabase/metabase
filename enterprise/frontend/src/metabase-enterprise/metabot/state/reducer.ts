import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
import type { WritableDraft } from "immer/dist/types/types-external";

import { logout } from "metabase/auth/actions";
import { uuid } from "metabase/lib/uuid";
import type {
  MetabotChatContext,
  MetabotHistory,
  MetabotReaction,
} from "metabase-types/api";

import { sendMessageRequest } from "./actions";

export interface MetabotState {
  confirmationOptions: Record<string, MetabotReaction[]> | undefined;
  isProcessing: boolean;
  lastSentContext: MetabotChatContext | undefined;
  lastHistoryValue: MetabotHistory | undefined;
  sessionId: string | undefined;
  userMessages: string[];
  visible: boolean;
}

export const metabotInitialState: MetabotState = {
  confirmationOptions: undefined,
  isProcessing: false,
  lastSentContext: undefined,
  lastHistoryValue: undefined,
  sessionId: undefined,
  userMessages: [],
  visible: false,
};

const hideMetabot = (state: WritableDraft<MetabotState>) => {
  state.visible = false;
  state.isProcessing = false;
  state.userMessages = [];
  state.confirmationOptions = undefined;
  state.lastSentContext = undefined;
  state.lastHistoryValue = undefined;
  state.sessionId = undefined;
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
    setSessionId: (state, action: PayloadAction<string | undefined>) => {
      state.sessionId = action.payload;
    },
    setVisible: (state, { payload: visible }: PayloadAction<boolean>) => {
      if (visible) {
        state.visible = true;
        state.sessionId = uuid();
      } else {
        hideMetabot(state);
      }
    },
    setConfirmationOptions: (
      state,
      action: PayloadAction<Record<string, MetabotReaction[]> | undefined>,
    ) => {
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
      })
      .addCase(logout.pending, state => {
        hideMetabot(state);
      });
  },
});

export const metabotReducer = metabot.reducer;
