import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
import { castDraft } from "immer";
import _ from "underscore";

import { logout } from "metabase/auth/actions";
import { uuid } from "metabase/lib/uuid";
import type {
  MetabotCodeEdit,
  MetabotHistory,
  MetabotSuggestedTransform,
  SuggestedTransform,
} from "metabase-types/api";

import { TOOL_CALL_MESSAGES } from "../constants";

import { sendAgentRequest } from "./actions";
import {
  type ConvoPayloadAction,
  convoReducer,
  createConversation,
  getMetabotInitialState,
  getRequestConversation,
  resetReactionState,
} from "./reducer-utils";
import type {
  MetabotAgentChatMessage,
  MetabotChatMessage,
  MetabotErrorMessage,
  MetabotToolCall,
  MetabotUserChatMessage,
} from "./types";
import { createMessageId } from "./utils";

export const metabot = createSlice({
  name: "metabase-enterprise/metabot",
  initialState: getMetabotInitialState(),
  reducers: {
    // TOP-LEVEL STATE REDUCERS
    createAgent: (state, action: ConvoPayloadAction<{ visible?: boolean }>) => {
      const { agentId, ...options } = action.payload;
      if (!state.conversations[agentId]) {
        const newConvo = createConversation(agentId, options);
        state.conversations[agentId] = castDraft(newConvo);
      } else {
        console.warn("Conversation already exists for agentId: ", agentId);
      }
    },
    destroyAgent: (state, action: ConvoPayloadAction) => {
      const { agentId } = action.payload;
      delete state.conversations[agentId];
      resetReactionState(state, agentId);
    },
    resetConversation: (state, action: ConvoPayloadAction) => {
      const { agentId } = action.payload;
      const visible = state.conversations[agentId]?.visible ?? false;
      const newConvo = createConversation(agentId, { visible });
      state.conversations[agentId] = castDraft(newConvo);
      resetReactionState(state, agentId);
    },
    setDebugMode: (state, action: PayloadAction<boolean>) => {
      state.debugMode = action.payload;
    },
    // CONVERSATION REDUCERS
    addDeveloperMessage: convoReducer(
      (convo, action: ConvoPayloadAction<{ message: string }>) => {
        convo.experimental.developerMessage = `HIDDEN DEVELOPER MESSAGE: ${action.payload.message}\n\n`;
      },
    ),
    addUserMessage: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<Omit<MetabotUserChatMessage, "role">>,
      ) => {
        const { id, message, agentId, ...rest } = action.payload;
        convo.errorMessages = [];
        convo.messages.push({ id, role: "user", ...rest, message } as any);
        convo.history.push({ id, role: "user", content: message });
      },
    ),
    addAgentMessage: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<
          Omit<MetabotAgentChatMessage, "id" | "role">
        >,
      ) => {
        convo.activeToolCalls = [];
        convo.messages.push({
          id: createMessageId(),
          role: "agent",
          ...action.payload,
          // transforms in message is making this flakily produce possibly infinite
          // typescript errors. since unused ts-expect-error directives produces
          // errors, casting this as any to avoid having to add / remove constantly.
        } as any);
      },
    ),
    addAgentErrorMessage: convoReducer(
      (convo, action: ConvoPayloadAction<MetabotErrorMessage>) => {
        convo.errorMessages.push(action.payload);
      },
    ),
    addAgentTextDelta: convoReducer(
      (convo, action: ConvoPayloadAction<{ text: string }>) => {
        const hasToolCalls = convo.activeToolCalls.length > 0;
        const lastMessage = _.last(convo.messages);
        const canAppend =
          !hasToolCalls &&
          lastMessage?.role === "agent" &&
          lastMessage.type === "text";

        if (canAppend) {
          lastMessage.message = lastMessage.message + action.payload.text;
        } else {
          convo.messages.push({
            id: createMessageId(),
            role: "agent",
            type: "text",
            message: action.payload.text,
          });
        }

        convo.activeToolCalls = hasToolCalls ? [] : convo.activeToolCalls;
      },
    ),
    toolCallStart: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<{
          toolCallId: string;
          toolName: string;
          args?: string;
        }>,
      ) => {
        const { toolCallId, toolName, args } = action.payload;
        convo.messages.push({
          id: toolCallId,
          role: "agent",
          type: "tool_call",
          name: toolName,
          args,
          status: "started",
        });
        convo.activeToolCalls.push({
          id: toolCallId,
          name: toolName,
          message: TOOL_CALL_MESSAGES[toolName],
          status: "started",
        });
      },
    ),
    toolCallEnd: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<{ toolCallId: string; result?: any }>,
      ) => {
        convo.activeToolCalls = convo.activeToolCalls.map((tc) =>
          tc.id === action.payload.toolCallId ? { ...tc, status: "ended" } : tc,
        );

        // Update the message in messages array with result for debug history
        const message = convo.messages.findLast(
          (msg) =>
            msg.type === "tool_call" && msg.id === action.payload.toolCallId,
        );
        if (message?.type === "tool_call") {
          message.status = "ended";
          message.result = action.payload.result;
        }
      },
    ),
    // NOTE: this reducer fn should be made smarter if/when we want to have
    // metabot's `state` object be able to remove / forget values. currently
    // we do not rewind the state to the point in time of the original prompt
    // so if / when this becomes expected, we'll need to do some extra work here
    // NOTE: this doesn't work in non-streaming contexts right now
    rewindStateToMessageId: convoReducer(
      (convo, action: ConvoPayloadAction<{ messageId: string }>) => {
        convo.isProcessing = false;

        const id = action.payload.messageId;
        const messageIndex = convo.messages.findLastIndex((m) => id === m.id);
        if (messageIndex > -1) {
          convo.messages = convo.messages.slice(0, messageIndex);
        }

        const historyIndex = convo.history.findLastIndex((h) => id === h.id);
        if (historyIndex > -1) {
          convo.history = convo.history.slice(0, historyIndex);
        }
      },
    ),
    setIsProcessing: convoReducer(
      (state, action: ConvoPayloadAction<{ processing: boolean }>) => {
        state.isProcessing = action.payload.processing;
      },
    ),
    setVisible: convoReducer(
      (state, action: ConvoPayloadAction<{ visible: boolean }>) => {
        state.visible = action.payload.visible;
      },
    ),
    setMetabotReqIdOverride: convoReducer(
      (state, action: ConvoPayloadAction<{ id: string | undefined }>) => {
        state.experimental.metabotReqIdOverride = action.payload.id;
      },
    ),
    setProfileOverride: convoReducer(
      (state, action: ConvoPayloadAction<{ profile: string | undefined }>) => {
        state.profileOverride = action.payload.profile;
      },
    ),
    // REACTIONS REDUCERS
    setNavigateToPath: (state, action: PayloadAction<string | null>) => {
      state.reactions.navigateToPath = action.payload;
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
    updateSuggestedTransformId: (
      state,
      action: PayloadAction<{
        suggestionId: string;
        newId: number | undefined;
      }>,
    ) => {
      const { suggestionId, newId } = action.payload;
      const transform = state.reactions.suggestedTransforms.find(
        (t) => t.suggestionId === suggestionId,
      );
      if (transform) {
        transform.id = newId;
      }
    },
    addSuggestedCodeEdit: (
      state,
      { payload: codeEdit }: PayloadAction<MetabotCodeEdit>,
    ) => {
      state.reactions.suggestedCodeEdits[codeEdit.buffer_id] = codeEdit;
    },
    removeSuggestedCodeEdit: (
      state,
      action: PayloadAction<MetabotCodeEdit["buffer_id"]>,
    ) => {
      delete state.reactions.suggestedCodeEdits[action.payload];
    },
    setConversationSnapshot: (
      state,
      action: PayloadAction<{
        messages: MetabotChatMessage[];
        history: MetabotHistory;
        state: any;
        suggestedTransforms: MetabotSuggestedTransform[];
        activeToolCalls: MetabotToolCall[];
        errorMessages: MetabotErrorMessage[];
        conversationId: string;
      }>,
    ) => {
      const convo = state.conversations["omnibot"];
      if (!convo) {
        return;
      }

      const {
        messages,
        history,
        state: snapshotState,
        suggestedTransforms,
        activeToolCalls,
        errorMessages,
        conversationId,
      } = action.payload;

      convo.messages = castDraft(messages ?? []);
      convo.history = history ?? [];
      convo.state = snapshotState ?? {};
      convo.activeToolCalls = activeToolCalls ?? [];
      convo.errorMessages = errorMessages ?? [];
      convo.conversationId = conversationId ?? uuid();
      convo.isProcessing = false;

      state.reactions.suggestedTransforms = (suggestedTransforms ?? []) as any;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(logout.pending, getMetabotInitialState)
      // CONVERSATION REQUEST REDUCERS
      .addCase(sendAgentRequest.pending, (state, action) => {
        const convo = getRequestConversation(state, action);
        if (convo) {
          convo.isProcessing = true;
          convo.errorMessages = [];
        }
      })
      .addCase(sendAgentRequest.fulfilled, (state, action) => {
        const convo = getRequestConversation(state, action);
        if (convo) {
          convo.state = { ...(action.payload?.state ?? {}) };
          convo.history = action.payload?.history?.slice() ?? [];
          convo.activeToolCalls = [];
          convo.isProcessing = false;
          convo.experimental.developerMessage = "";
        }
      })
      .addCase(sendAgentRequest.rejected, (state, action) => {
        const convo = getRequestConversation(state, action);
        if (convo) {
          // aborted requests needs special state adjustments
          if (action.payload?.type === "abort") {
            convo.state = { ...(action.payload?.state ?? {}) };
            convo.history = action.payload?.history?.slice() ?? [];
            if (action.payload.unresolved_tool_calls.length > 0) {
              // update history w/ synthetic tool_result entries for each unresolved tool call
              // as having a tool_call without a matching tool_result is invalid
              const syntheticToolResults =
                action.payload.unresolved_tool_calls.map((tc) => ({
                  role: "tool" as const,
                  content: "Tool execution interrupted by user",
                  tool_call_id: tc.toolCallId,
                }));
              convo.history.push(...syntheticToolResults);

              // update message state so that unresolved tools are marked as ended
              convo.messages.forEach((msg) => {
                if (msg.type === "tool_call" && msg.status === "started") {
                  msg.status = "ended";
                  msg.result = "Tool execution interrupted by user";
                  msg.is_error = true;
                }
              });
            }
          }

          convo.activeToolCalls = [];
          convo.isProcessing = false;
        }
      });
  },
});

export const metabotReducer = metabot.reducer;
export const metabotActions = metabot.actions;
