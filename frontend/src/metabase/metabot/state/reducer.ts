import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
import { castDraft } from "immer";
import _ from "underscore";

import { logout } from "metabase/redux/auth";
import { uuid } from "metabase/utils/uuid";
import type {
  MetabotCodeEdit,
  MetabotStateContext,
  MetabotSuggestedTransform,
  SuggestedTransform,
} from "metabase-types/api";

import type { MetabotProfileId } from "../constants";

import { sendAgentRequest } from "./actions";
import {
  type ConvoPayloadAction,
  appendAgentTurnAborted,
  appendAgentTurnErrored,
  convoReducer,
  createConversation,
  findLastToolCallMessage,
  getMetabotInitialState,
  getRequestConversation,
  pushNewToolCall,
  resetReactionState,
} from "./reducer-utils";
import type {
  MetabotAgentChatMessage,
  MetabotChatMessage,
  MetabotToolCall,
  MetabotUserChatMessage,
} from "./types";
import { createMessageId, hasInProgressMessage } from "./utils";

export const metabot = createSlice({
  name: "metabase/metabot",
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
    setConversationTitle: convoReducer(
      (convo, action: ConvoPayloadAction<{ title: string }>) => {
        convo.title = action.payload.title;
      },
    ),
    setIsPollingForTitle: convoReducer(
      (convo, action: ConvoPayloadAction<{ isPollingForTitle: boolean }>) => {
        convo.isPollingForTitle = action.payload.isPollingForTitle;
      },
    ),
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
        // Unjustified type cast. FIXME
        convo.messages.push({ id, role: "user", ...rest, message } as any);
      },
    ),
    addAgentMessage: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<
          Omit<MetabotAgentChatMessage, "id" | "role" | "externalId">
        >,
      ) => {
        convo.activeToolCalls = [];
        const externalId = convo.pendingMessageExternalId;
        // Unjustified type cast. FIXME
        convo.messages.push({
          id: createMessageId(),
          role: "agent",
          ...action.payload,
          ...(externalId ? { externalId } : {}),
          // transforms in message is making this flakily produce possibly infinite
          // typescript errors. since unused ts-expect-error directives produces
          // errors, casting this as any to avoid having to add / remove constantly.
        } as any);
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
          const externalId = convo.pendingMessageExternalId;
          convo.messages.push({
            id: createMessageId(),
            role: "agent",
            type: "text",
            message: action.payload.text,
            ...(externalId ? { externalId } : {}),
          });
        }

        convo.activeToolCalls = hasToolCalls ? [] : convo.activeToolCalls;
      },
    ),
    setMessageExternalIds: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<{
          agentMessageId?: string;
          userMessageId?: string;
        }>,
      ) => {
        const { agentMessageId, userMessageId } = action.payload;
        if (agentMessageId) {
          convo.pendingMessageExternalId = agentMessageId;
        }
        const lastUserMessage = convo.messages.findLast(
          (m) => m.role === "user",
        );
        if (userMessageId && lastUserMessage) {
          lastUserMessage.externalId = userMessageId;
        }
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
        // idempotent: both tool-input-start and tool-input-available are
        // able to signal the start of a tool call
        if (convo.activeToolCalls.some((tc) => tc.id === toolCallId)) {
          return;
        }
        pushNewToolCall(convo, { toolCallId, toolName, args });
      },
    ),
    toolCallArgs: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<{
          toolCallId: string;
          toolName: string;
          args: string;
        }>,
      ) => {
        const { toolCallId, toolName, args } = action.payload;
        const existingMsg = findLastToolCallMessage(convo, toolCallId);
        if (existingMsg) {
          // if toolCallStart was called (tool-input-start event is optional)
          // update the existing tool call record to include the args received
          existingMsg.args = args;
        } else {
          pushNewToolCall(convo, { toolCallId, toolName, args });
        }
      },
    ),
    toolCallEnd: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<{
          toolCallId: string;
          result?: string;
          isError?: boolean;
        }>,
      ) => {
        convo.activeToolCalls = convo.activeToolCalls.map((tc) =>
          tc.id === action.payload.toolCallId ? { ...tc, status: "ended" } : tc,
        );

        // Update the message in messages array with result for debug history
        const message = findLastToolCallMessage(
          convo,
          action.payload.toolCallId,
        );
        if (message) {
          message.status = "ended";
          message.result = action.payload.result;
          if (action.payload.isError) {
            message.is_error = true;
          }
        }
      },
    ),
    // only the last turn is rewindable (retry), so a single pre-turn snapshot
    // is enough to roll `state` back; the server reconstructs it independently
    rewindStateToMessageId: convoReducer(
      (convo, action: ConvoPayloadAction<{ messageId: string }>) => {
        convo.isProcessing = false;

        const id = action.payload.messageId;
        const messageIndex = convo.messages.findLastIndex((m) => id === m.id);
        if (messageIndex > -1) {
          convo.messages = convo.messages.slice(0, messageIndex);
        }

        if (convo.stateBeforeTurn) {
          convo.state = convo.stateBeforeTurn;
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
      (
        state,
        action: ConvoPayloadAction<{ profile: MetabotProfileId | undefined }>,
      ) => {
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
    setConversationSnapshot: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<{
          messages: MetabotChatMessage[];
          state?: MetabotStateContext;
          activeToolCalls?: MetabotToolCall[];
          conversationId: string;
          title?: string;
        }>,
        state,
      ) => {
        const {
          agentId,
          messages,
          state: snapshotState,
          activeToolCalls,
          conversationId,
          title,
        } = action.payload;

        convo.messages = castDraft(messages ?? []);
        convo.state = snapshotState ?? {};
        convo.activeToolCalls = activeToolCalls ?? [];
        convo.conversationId = conversationId ?? uuid();
        convo.title = title;
        convo.isProcessing = hasInProgressMessage(messages ?? []);
        convo.stateBeforeTurn = undefined;
        convo.pendingMessageExternalId = undefined;

        // NOTE: live reactions aren't reconstructed from a fetched snapshot
        resetReactionState(state, agentId);
      },
    ),
  },
  extraReducers: (builder) => {
    builder
      .addCase(logout.pending, getMetabotInitialState)
      // CONVERSATION REQUEST REDUCERS
      .addCase(sendAgentRequest.pending, (state, action) => {
        const convo = getRequestConversation(state, action);
        if (convo) {
          convo.isProcessing = true;
          convo.stateBeforeTurn = convo.state;
          convo.pendingMessageExternalId = action.meta.arg.assistant_message_id;
        }
      })
      .addCase(sendAgentRequest.fulfilled, (state, action) => {
        const convo = getRequestConversation(state, action);
        if (convo) {
          if (action.payload?.state) {
            convo.state = { ...action.payload.state };
          }
          convo.activeToolCalls = [];
          convo.isProcessing = false;
          convo.experimental.developerMessage = "";
          convo.pendingMessageExternalId = undefined;
        }
      })
      .addCase(sendAgentRequest.rejected, (state, action) => {
        const convo = getRequestConversation(state, action);
        if (convo) {
          // aborted requests needs special state adjustments
          if (action.payload?.type === "abort") {
            if (action.payload?.state) {
              convo.state = { ...action.payload.state };
            }
            // an abort means the request (almost certainly) reached the server,
            // so the turn's rows exist under the client-minted id even when the
            // start event never arrived — stamp it so retry can target the prompt
            const lastUserMessage = convo.messages.findLast(
              (m) => m.role === "user",
            );
            if (lastUserMessage && !lastUserMessage.externalId) {
              lastUserMessage.externalId = action.meta.arg.user_message_id;
            }
            appendAgentTurnAborted(convo);
            if (action.payload.unresolved_tool_calls.length > 0) {
              // update message state so that unresolved tools are marked as ended
              convo.messages.forEach((msg) => {
                if (msg.type === "tool_call" && msg.status === "started") {
                  msg.status = "ended";
                  msg.result = "Tool execution interrupted by user";
                  msg.is_error = true;
                }
              });
            }
          } else if (action.payload?.type === "error") {
            appendAgentTurnErrored(
              convo,
              action.payload.error,
              action.payload.display,
            );
          }

          convo.pendingMessageExternalId = undefined;
          convo.activeToolCalls = [];
          convo.isProcessing = false;
        }
      });
  },
});

export const metabotReducer = metabot.reducer;
export const metabotActions = metabot.actions;
