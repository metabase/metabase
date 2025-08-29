import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
import _ from "underscore";

import { logout } from "metabase/auth/actions";
import { uuid } from "metabase/lib/uuid";
import type { MetabotHistory } from "metabase-types/api";

import { TOOL_CALL_MESSAGES } from "../constants";

import { sendAgentRequest } from "./actions";
import { createMessageId } from "./utils";

export type MetabotChatMessage = {
  id: string;
  role: "user" | "agent";
  message: string;
};

export type MetabotErrorMessage = {
  type: "message" | "alert";
  message: string;
};

export type MetabotToolCall = {
  id: string;
  name: string;
  message: string | undefined;
  status: "started" | "ended";
};

export type MetabotReactionsState = {
  navigateToPath: string | null;
};

export interface MetabotState {
  isProcessing: boolean;
  conversationId: string;
  messages: MetabotChatMessage[];
  errorMessages: MetabotErrorMessage[];
  visible: boolean;
  history: MetabotHistory;
  state: any;
  reactions: MetabotReactionsState;
  toolCalls: MetabotToolCall[];
  experimental: {
    profileOverride: string | undefined;
  };
}

export const getMetabotInitialState = (): MetabotState => ({
  isProcessing: false,
  conversationId: uuid(),
  messages: [],
  errorMessages: [],
  visible: false,
  history: [],
  state: {},
  reactions: {
    navigateToPath: null,
  },
  toolCalls: [],
  experimental: {
    profileOverride: undefined,
  },
});

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState: getMetabotInitialState(),
  reducers: {
    addUserMessage: (
      state,
      action: PayloadAction<Omit<MetabotChatMessage, "role">>,
    ) => {
      const { id, message } = action.payload;

      state.errorMessages = [];
      state.messages.push({ id, role: "user", message });
      state.history.push({ id, role: "user", content: message });
    },
    addAgentMessage: (
      state,
      action: PayloadAction<Omit<MetabotChatMessage, "id" | "role">>,
    ) => {
      state.toolCalls = [];
      state.messages.push({
        id: createMessageId(),
        role: "agent",
        message: action.payload.message,
      });
    },
    addAgentErrorMessage: (
      state,
      action: PayloadAction<MetabotErrorMessage>,
    ) => {
      state.errorMessages.push(action.payload);
    },
    addAgentTextDelta: (state, action: PayloadAction<string>) => {
      const hasToolCalls = state.toolCalls.length > 0;
      const lastMessage = _.last(state.messages);
      const canAppend = !hasToolCalls && lastMessage?.role === "agent";

      if (canAppend) {
        lastMessage!.message = lastMessage!.message + action.payload;
      } else {
        state.messages.push({
          id: createMessageId(),
          role: "agent",
          message: action.payload,
        });
      }

      state.toolCalls = hasToolCalls ? [] : state.toolCalls;
    },
    toolCallStart: (
      state,
      action: PayloadAction<{ toolCallId: string; toolName: string }>,
    ) => {
      const { toolCallId, toolName } = action.payload;
      state.toolCalls.push({
        id: toolCallId,
        name: toolName,
        message: TOOL_CALL_MESSAGES[toolName],
        status: "started",
      });
    },
    toolCallEnd: (state, action: PayloadAction<{ toolCallId: string }>) => {
      state.toolCalls = state.toolCalls.map((tc) =>
        tc.id === action.payload.toolCallId ? { ...tc, status: "ended" } : tc,
      );
    },
    // NOTE: this reducer fn should be made smarter if/when we want to have
    // metabot's `state` object be able to remove / forget values. currently
    // we do not rewind the state to the point in time of the original prompt
    // so if / when this becomes expected, we'll need to do some extra work here
    // NOTE: this doesn't work in non-streaming contexts right now
    rewindStateToMessageId: (state, { payload: id }: PayloadAction<string>) => {
      state.isProcessing = false;
      const messageIndex = state.messages.findLastIndex((m) => id === m.id);
      if (messageIndex > -1) {
        state.messages = state.messages.slice(0, messageIndex);
      }

      const historyIndex = state.history.findLastIndex((h) => id === h.id);
      if (historyIndex > -1) {
        state.history = state.history.slice(0, historyIndex);
      }
    },
    resetConversation: (state) => {
      state.messages = [];
      state.errorMessages = [];
      state.history = [];
      state.state = {};
      state.isProcessing = false;
      state.toolCalls = [];
      state.conversationId = uuid();
    },
    resetConversationId: (state) => {
      state.conversationId = uuid();
    },
    setIsProcessing: (state, action: PayloadAction<boolean>) => {
      state.isProcessing = action.payload;
    },
    setNavigateToPath: (state, action: PayloadAction<string>) => {
      state.reactions.navigateToPath = action.payload;
    },
    setVisible: (state, action: PayloadAction<boolean>) => {
      state.visible = action.payload;
    },
    setProfileOverride: (state, action: PayloadAction<string | undefined>) => {
      state.experimental.profileOverride = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(logout.pending, getMetabotInitialState)
      // streamed response handlers
      .addCase(sendAgentRequest.pending, (state) => {
        state.isProcessing = true;
        state.errorMessages = [];
      })
      .addCase(sendAgentRequest.fulfilled, (state, action) => {
        state.history = action.payload?.history?.slice() ?? [];
        state.state = { ...(action.payload?.state ?? {}) };
        state.toolCalls = [];
        state.isProcessing = false;
      })
      .addCase(sendAgentRequest.rejected, (state) => {
        state.toolCalls = [];
        state.isProcessing = false;
      });
  },
});

export const metabotReducer = metabot.reducer;
