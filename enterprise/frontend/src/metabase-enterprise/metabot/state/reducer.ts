import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { logout } from "metabase/auth/actions";
import { uuid } from "metabase/lib/uuid";
import type { MetabotHistory, MetabotStateContext } from "metabase-types/api";

import { sendAgentRequest, sendStreamedAgentRequest } from "./actions";

export type MetabotAgentChatMessage =
  | { actor: "agent"; message: string; type: "reply" }
  | { actor: "agent"; message: string; type: "error" };

export type MetabotUserChatMessage = { actor: "user"; message: string };

export type MetabotChatMessage =
  | MetabotAgentChatMessage
  | MetabotUserChatMessage;

export interface MetabotState {
  useStreaming: boolean;
  isProcessing: boolean;
  conversationId: string | undefined;
  messages: MetabotChatMessage[];
  visible: boolean;
  history: MetabotHistory;
  state: any;
  activeToolCall: { id: string; name: string } | undefined;
}

export const metabotInitialState: MetabotState = {
  useStreaming: false,
  isProcessing: false,
  conversationId: undefined,
  messages: [],
  visible: false,
  history: [],
  state: {},
  activeToolCall: undefined,
};

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState: metabotInitialState,
  reducers: {
    toggleStreaming: (state) => {
      state.useStreaming = !state.useStreaming;
    },
    addUserMessage: (state, action: PayloadAction<string>) => {
      state.messages.push({ actor: "user", message: action.payload });

      if (state.useStreaming) {
        state.history.push({ role: "user", content: action.payload });
      }
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
    setStateContext: (state, action: PayloadAction<MetabotStateContext>) => {
      state.state = action.payload;
    },
    toolCallStart: (
      state,
      action: PayloadAction<{ toolCallId: string; toolName: string }>,
    ) => {
      const { toolCallId, toolName } = action.payload;
      state.activeToolCall = { id: toolCallId, name: toolName };
    },
    toolCallEnd: (state) => {
      state.activeToolCall = undefined;
    },
    resetConversation: (state) => {
      state.messages = [];
      state.history = [];
      state.state = {};
      state.isProcessing = false;
      state.activeToolCall = undefined;
      state.conversationId = uuid();
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
      .addCase(logout.pending, () => metabotInitialState)
      // streamed response handlers
      .addCase(sendStreamedAgentRequest.pending, (state) => {
        state.isProcessing = true;
      })
      .addCase(sendStreamedAgentRequest.fulfilled, (state, action) => {
        state.history = action.payload?.data?.history?.slice() ?? [];
        state.state = { ...(action.payload?.data?.state ?? {}) };
        state.activeToolCall = undefined;
        state.isProcessing = false;
      })
      .addCase(sendStreamedAgentRequest.rejected, (state) => {
        state.activeToolCall = undefined;
        state.isProcessing = false;
      })
      // non-streamed response handlers
      .addCase(sendAgentRequest.pending, (state) => {
        state.isProcessing = true;
      })
      .addCase(sendAgentRequest.fulfilled, (state, action) => {
        state.history = action.payload?.data?.history?.slice() ?? [];
        state.state = { ...(action.payload?.data?.state ?? {}) };
        state.isProcessing = false;
      })
      .addCase(sendAgentRequest.rejected, (state) => {
        state.isProcessing = false;
      });
  },
});

export const metabotReducer = metabot.reducer;
