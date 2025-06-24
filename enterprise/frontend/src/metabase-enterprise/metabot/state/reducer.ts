import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
import _ from "underscore";

import { logout } from "metabase/auth/actions";
import { uuid } from "metabase/lib/uuid";
import type { MetabotHistory, MetabotStateContext } from "metabase-types/api";

import { sendAgentRequest, sendStreamedAgentRequest } from "./actions";
import { createMessageId } from "./utils";

export type MetabotAgentChatMessage =
  | { id: string; role: "agent"; message: string; type: "reply" }
  | { id: string; role: "agent"; message: string; type: "error" };

export type MetabotUserChatMessage = {
  id: string;
  role: "user";
  message: string;
};

export type MetabotChatMessage =
  | MetabotAgentChatMessage
  | MetabotUserChatMessage;

export interface MetabotState {
  useStreaming: boolean;
  isProcessing: boolean;
  conversationId: string;
  messages: MetabotChatMessage[];
  visible: boolean;
  history: MetabotHistory;
  state: any;
  activeToolCall: { id: string; name: string } | undefined;
}

export const getMetabotInitialState = (): MetabotState => ({
  useStreaming: false,
  isProcessing: false,
  conversationId: uuid(),
  messages: [],
  visible: false,
  history: [],
  state: {},
  activeToolCall: undefined,
});

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState: getMetabotInitialState(),
  reducers: {
    toggleStreaming: (state) => {
      state.useStreaming = !state.useStreaming;
    },
    addUserMessage: (
      state,
      action: PayloadAction<Omit<MetabotUserChatMessage, "role">>,
    ) => {
      const { id, message } = action.payload;

      const lastMessage = _.last(state.messages);
      if (lastMessage?.role === "agent" && lastMessage?.type === "error") {
        state.messages.pop();
      }

      state.messages.push({ id, role: "user", message });
      if (state.useStreaming) {
        state.history.push({ id, role: "user", content: message });
      }
    },
    addAgentMessage: (
      state,
      action: PayloadAction<Omit<MetabotAgentChatMessage, "id" | "role">>,
    ) => {
      state.messages.push({
        id: createMessageId(),
        role: "agent",
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
    // NOTE: this reducer fn should be made smarter if/when we want to have
    // metabot's `state` object be able to remove / forget values. currently
    // we do not rewind the state to the point in time of the original prompt
    // so if / when this becomes expected, we'll need to do some extra work here
    // NOTE: this doesn't work in non-streaming contexts right now
    rewindStateToMessageId: (state, { payload: id }: PayloadAction<string>) => {
      if (state.useStreaming) {
        const messageIndex = state.messages.findLastIndex((m) => id === m.id);
        const historyIndex = state.history.findLastIndex((h) => id === h.id);
        if (historyIndex > -1 && messageIndex > -1) {
          state.isProcessing = false;
          state.messages = state.messages.slice(0, messageIndex);
          state.history = state.history.slice(0, historyIndex);
        }
      }
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
      .addCase(logout.pending, getMetabotInitialState)
      // streamed response handlers
      .addCase(sendStreamedAgentRequest.pending, (state) => {
        state.isProcessing = true;
      })
      .addCase(sendStreamedAgentRequest.fulfilled, (state, action) => {
        state.history = [
          ...state.history,
          ...(action.payload?.history?.slice() ?? []),
        ];
        state.state = { ...(action.payload?.state ?? {}) };
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
        state.history = action.payload?.history?.slice() ?? [];
        state.state = { ...(action.payload?.state ?? {}) };
        state.isProcessing = false;
      })
      .addCase(sendAgentRequest.rejected, (state) => {
        state.isProcessing = false;
      });
  },
});

export const metabotReducer = metabot.reducer;
