import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
import _ from "underscore";

import { logout } from "metabase/auth/actions";
import { uuid } from "metabase/lib/uuid";
import type {
  MetabotHistory,
  MetabotTodoItem,
  MetabotTransformInfo,
  SuggestedTransform,
} from "metabase-types/api";

import { TOOL_CALL_MESSAGES } from "../constants";

import { sendAgentRequest } from "./actions";
import { createMessageId } from "./utils";

export type MetabotUserTextChatMessage = {
  id: string;
  role: "user";
  type: "text";
  message: string;
};

export type MetabotUserActionChatMessage = {
  id: string;
  role: "user";
  type: "action";
  message: string;
  userMessage: string;
};

export type MetabotAgentTextChatMessage = {
  id: string;
  role: "agent";
  type: "text";
  message: string;
};

export type MetabotAgentTodoListChatMessage = {
  id: string;
  role: "agent";
  type: "todo_list";
  payload: MetabotTodoItem[];
};

export type MetabotAgentEditSuggestionChatMessage = {
  id: string;
  role: "agent";
  type: "edit_suggestion";
  model: "transform";
  payload: {
    editorTransform: MetabotTransformInfo | undefined;
    suggestedTransform: MetabotSuggestedTransform;
  };
};

export type MetabotDebugToolCallMessage = {
  id: string;
  role: "agent";
  type: "tool_call";
  name: string;
  args?: string;
  status: "started" | "ended";
  result?: string;
  is_error?: boolean;
};

export type MetabotAgentChatMessage =
  | MetabotAgentTextChatMessage
  | MetabotAgentTodoListChatMessage
  | MetabotAgentEditSuggestionChatMessage
  | MetabotDebugToolCallMessage;

export type MetabotUserChatMessage =
  | MetabotUserTextChatMessage
  | MetabotUserActionChatMessage;

export type MetabotDebugChatMessage = MetabotDebugToolCallMessage;

export type MetabotChatMessage =
  | MetabotUserChatMessage
  | MetabotAgentChatMessage
  | MetabotDebugChatMessage;

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

export type MetabotSuggestedTransform = SuggestedTransform & {
  active: boolean;
  suggestionId: string; // internal unique identifier for marking active/inactive
};

export type MetabotCodeEdit = {
  bufferId: string;
  mode: "rewrite";
  value: string;
  active?: boolean;
};

export type MetabotReactionsState = {
  navigateToPath: string | null;
  suggestedCodeEdits: MetabotCodeEdit[];
  suggestedTransforms: MetabotSuggestedTransform[];
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
  activeToolCalls: MetabotToolCall[];
  profile?: string;
  experimental: {
    debugMode: boolean;
    metabotReqIdOverride: string | undefined;
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
    suggestedCodeEdits: [],
    // NOTE: suggestedTransforms should be folded into suggestedCodeEdits eventually
    suggestedTransforms: [],
  },
  activeToolCalls: [],
  experimental: {
    debugMode: false,
    metabotReqIdOverride: undefined,
    profileOverride: undefined,
  },
});

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState: getMetabotInitialState(),
  reducers: {
    addUserMessage: (
      state,
      action: PayloadAction<Omit<MetabotUserChatMessage, "role">>,
    ) => {
      const { id, message, ...rest } = action.payload;

      state.errorMessages = [];
      state.messages.push({ id, role: "user", message, ...rest } as any);
      state.history.push({ id, role: "user", content: message });
    },
    addAgentMessage: (
      state,
      action: PayloadAction<Omit<MetabotAgentChatMessage, "id" | "role">>,
    ) => {
      state.activeToolCalls = [];
      state.messages.push({
        id: createMessageId(),
        role: "agent",
        ...action.payload,
        // transforms in message is making this flakily produce possibly infinite
        // typescript errors. since unused ts-expect-error directives produces
        // errors, casting this as any to avoid having to add / remove constantly.
      } as any);
    },
    addAgentErrorMessage: (
      state,
      action: PayloadAction<MetabotErrorMessage>,
    ) => {
      state.errorMessages.push(action.payload);
    },
    addAgentTextDelta: (state, action: PayloadAction<string>) => {
      const hasToolCalls = state.activeToolCalls.length > 0;
      const lastMessage = _.last(state.messages);
      const canAppend =
        !hasToolCalls &&
        lastMessage?.role === "agent" &&
        lastMessage.type === "text";

      if (canAppend) {
        lastMessage.message = lastMessage.message + action.payload;
      } else {
        state.messages.push({
          id: createMessageId(),
          role: "agent",
          type: "text",
          message: action.payload,
        });
      }

      state.activeToolCalls = hasToolCalls ? [] : state.activeToolCalls;
    },
    toolCallStart: (
      state,
      action: PayloadAction<{
        toolCallId: string;
        toolName: string;
        args?: string;
      }>,
    ) => {
      const { toolCallId, toolName, args } = action.payload;
      state.messages.push({
        id: toolCallId,
        role: "agent",
        type: "tool_call",
        name: toolName,
        args,
        status: "started",
      });
      state.activeToolCalls.push({
        id: toolCallId,
        name: toolName,
        message: TOOL_CALL_MESSAGES[toolName],
        status: "started",
      });
    },
    toolCallEnd: (
      state,
      action: PayloadAction<{ toolCallId: string; result?: any }>,
    ) => {
      state.activeToolCalls = state.activeToolCalls.map((tc) =>
        tc.id === action.payload.toolCallId ? { ...tc, status: "ended" } : tc,
      );

      // Update the message in messages array with result for debug history
      const message = state.messages.findLast(
        (msg) =>
          msg.type === "tool_call" && msg.id === action.payload.toolCallId,
      );
      if (message?.type === "tool_call") {
        message.status = "ended";
        message.result = action.payload.result;
      }
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
      state.activeToolCalls = [];
      state.conversationId = uuid();
      state.reactions.suggestedTransforms = [];
      state.experimental.metabotReqIdOverride = undefined;
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
    setMetabotReqIdOverride: (
      state,
      action: PayloadAction<string | undefined>,
    ) => {
      state.experimental.metabotReqIdOverride = action.payload;
    },
    setProfileOverride: (state, action: PayloadAction<string | undefined>) => {
      state.experimental.profileOverride = action.payload;
    },
    setDebugMode: (state, action: PayloadAction<boolean>) => {
      state.experimental.debugMode = action.payload;
    },
    addSuggestedTransform: (
      state,
      { payload: transform }: PayloadAction<MetabotSuggestedTransform>,
    ) => {
      // mark all other transform w/ same id as inactive before adding new one
      state.reactions.suggestedTransforms.forEach((t) => {
        if (t.id === transform.id) {
          t.active = false;
        }
      });
      // transform type caused flaky "possible infinite type definition" errorj
      // ts-expect-error fails when it doesn't fail, so casting to any
      state.reactions.suggestedTransforms.push(transform as any);
    },
    activateSuggestedTransform: (
      state,
      action: PayloadAction<{
        id?: SuggestedTransform["id"];
        suggestionId: string;
      }>,
    ) => {
      const { id, suggestionId } = action.payload;

      state.reactions.suggestedTransforms.forEach((t) => {
        if (t.id === id) {
          t.active = t.suggestionId === suggestionId;
        }
      });
    },
    deactivateSuggestedTransform: (
      state,
      action: PayloadAction<SuggestedTransform["id"] | undefined>,
    ) => {
      state.reactions.suggestedTransforms.forEach((t) => {
        if (t.id === action.payload) {
          t.active = false;
        }
      });
    },
    addSuggestedCodeEdit: (
      state,
      { payload }: PayloadAction<MetabotCodeEdit>,
    ) => {
      // mark all other edits w/ same buffer id as inactive before adding new one
      state.reactions.suggestedCodeEdits.forEach((t) => {
        t.active = t.bufferId === payload.bufferId ? false : t.active;
      });
      state.reactions.suggestedCodeEdits.push(payload);
    },
    deactivateSuggestedCodeEdit: (
      state,
      action: PayloadAction<MetabotCodeEdit["bufferId"] | undefined>,
    ) => {
      state.reactions.suggestedCodeEdits.forEach((t) => {
        t.active = t.bufferId === action.payload ? false : t.active;
      });
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
        state.state = { ...(action.payload?.state ?? {}) };
        state.history = action.payload?.history?.slice() ?? [];
        state.activeToolCalls = [];
        state.isProcessing = false;
      })
      .addCase(sendAgentRequest.rejected, (state, action) => {
        // aborted requests needs special state adjustments
        if (action.payload?.type === "abort") {
          state.state = { ...(action.payload?.state ?? {}) };
          state.history = action.payload?.history?.slice() ?? [];
          if (action.payload.unresolved_tool_calls.length > 0) {
            // update history w/ synthetic tool_result entries for each unresolved tool call
            // as having a tool_call without a matching tool_result is invalid
            const syntheticToolResults =
              action.payload.unresolved_tool_calls.map((tc) => ({
                role: "tool" as const,
                content: "Tool execution interrupted by user",
                tool_call_id: tc.toolCallId,
              }));
            state.history.push(...syntheticToolResults);

            // update message state so that unresolved tools are marked as ended
            state.messages.forEach((msg) => {
              if (msg.type === "tool_call" && msg.status === "started") {
                msg.status = "ended";
                msg.result = "Tool execution interrupted by user";
                msg.is_error = true;
              }
            });
          }
        }

        state.activeToolCalls = [];
        state.isProcessing = false;
      });
  },
});

export const metabotReducer = metabot.reducer;
