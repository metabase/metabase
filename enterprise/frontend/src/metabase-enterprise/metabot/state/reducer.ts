import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { logout } from "metabase/auth/actions";
import { uuid } from "metabase/lib/uuid";
import type {
  MetabotChatContext,
  MetabotHistory,
  MetabotStateContext,
} from "metabase-types/api";

import { sendMessageRequest } from "./actions";

export type MetabotAgentChatMessage =
  | { actor: "agent"; message: string; type: "reply" }
  | { actor: "agent"; message: string; type: "error" };

export type MetabotUserChatMessage = { actor: "user"; message: string };

export type MetabotChatMessage =
  | MetabotAgentChatMessage
  | MetabotUserChatMessage;

export interface MetabotState {
  isProcessing: boolean;
  lastSentContext: MetabotChatContext | undefined;
  conversationId: string | undefined;
  messages: MetabotChatMessage[];
  visible: boolean;
  history: MetabotHistory;
  stateContext: MetabotStateContext;
  activeToolCalls: { id: string; name: string }[];
}

export const metabotInitialState: MetabotState = {
  isProcessing: false,
  lastSentContext: undefined,
  conversationId: undefined,
  messages: [],
  visible: false,
  history: [],
  stateContext: {},
  activeToolCalls: [],
};

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState: metabotInitialState,
  reducers: {
    addUserMessage: (state, action: PayloadAction<string>) => {
      state.messages.push({ actor: "user", message: action.payload });
      state.history.push({ role: "user", content: action.payload });
    },
    addAgentMessage: (
      state,
      action: PayloadAction<Omit<MetabotAgentChatMessage, "actor">>,
    ) => {
      state.messages.push({
        actor: "agent",
        message: action.payload.message,
        type: action.payload.type,
      });
    },
    appendHistory: (state, action: PayloadAction<MetabotHistory>) => {
      state.history = [...state.history, ...action.payload];
    },
    setStateContext: (state, action: PayloadAction<MetabotStateContext>) => {
      state.stateContext = action.payload;
    },
    toolCallStart: (
      state,
      action: PayloadAction<{ toolCallId: string; toolName: string }>,
    ) => {
      const { toolCallId, toolName } = action.payload;
      state.activeToolCalls.push({ id: toolCallId, name: toolName });
    },
    toolCallEnd: (state, action: PayloadAction<string>) => {
      state.activeToolCalls = state.activeToolCalls.filter(
        (tc) => tc.id !== action.payload,
      );
    },
    clearMessages: (state) => {
      state.messages = [];
      state.history = [];
      state.state = {};
      state.isProcessing = false;
      state.activeToolCalls = [];
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
        state.isProcessing = true;
      })
      .addCase(sendMessageRequest.fulfilled, (state, action) => {
        state.history = action.payload?.data?.history ?? [];
        state.activeToolCalls = [];
        state.isProcessing = false;
      })
      .addCase(sendMessageRequest.rejected, (state) => {
        state.activeToolCalls = [];
        state.isProcessing = false;
      })
      .addCase(logout.pending, () => metabotInitialState);
  },
});

export const metabotReducer = metabot.reducer;
