import {
  type PayloadAction,
  type UnknownAction,
  createSlice,
} from "@reduxjs/toolkit";
import { type WritableDraft, castDraft } from "immer";
import _ from "underscore";

import type { SearchResultItem } from "metabase/api/ai-streaming/schemas";
import { logout } from "metabase/redux/auth";
import { LOCATION_CHANGE, type Location, matchPath } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  MetabotCodeEdit,
  MetabotStateContext,
  MetabotSuggestedTransform,
  SuggestedTransform,
} from "metabase-types/api";

import type { MetabotProfileId } from "../constants";
import { isContextWindowFull } from "../utils/context-usage";

import { sendAgentRequest } from "./actions";
import {
  type AgentPayloadAction,
  type ConvoPayloadAction,
  addChainTool,
  agentReducer,
  appendChainReasoning,
  closeChain,
  convoReducer,
  createAgentState,
  createConversation,
  createConversationForAgent,
  endChainTool,
  ensureChain,
  evictConversationIfUnused,
  findLastToolCallPart,
  getAgentOrThrow,
  getMetabotInitialState,
  getRequestConversation,
  openAgentMessage,
  pushNewToolCall,
  resetReactionState,
  resetReactionStateForConversation,
  setChainToolSearchResults,
  setChainToolTitle,
  startAgentMessage,
  startChainReasoning,
  startUserMessage,
} from "./reducer-utils";
import type {
  MetabotAgentId,
  MetabotMessage,
  MetabotMessagePart,
  MetabotState,
  MetabotToolCall,
  MetabotUserChatMessage,
} from "./types";
import { createMessageId, hasInProgressMessage } from "./utils";

const isLocationChange = (
  action: UnknownAction,
): action is PayloadAction<Location, typeof LOCATION_CHANGE> =>
  action.type === LOCATION_CHANGE;

const startNewConversationForAgent = (
  state: WritableDraft<MetabotState>,
  agentId: MetabotAgentId,
) => {
  const agent = getAgentOrThrow(state, agentId);
  const previousConversationId = agent.conversationId;
  const convo = createConversationForAgent(agentId);
  state.conversations[convo.conversationId] = castDraft(convo);
  agent.conversationId = convo.conversationId;
  resetReactionState(state, agentId);
  evictConversationIfUnused(state, previousConversationId);
};

const attachAgent = (
  state: WritableDraft<MetabotState>,
  agentId: MetabotAgentId,
  conversationId: string,
) => {
  const agent = getAgentOrThrow(state, agentId);
  if (agent.conversationId === conversationId) {
    return;
  }
  const previousConversationId = agent.conversationId;
  state.conversations[conversationId] ??= castDraft(
    createConversationForAgent(agentId, { conversationId }),
  );
  agent.conversationId = conversationId;
  resetReactionState(state, agentId);
  evictConversationIfUnused(state, previousConversationId);
};

export const metabot = createSlice({
  name: "metabase/metabot",
  initialState: getMetabotInitialState(),
  reducers: {
    // TOP-LEVEL STATE REDUCERS
    createAgent: (state, action: AgentPayloadAction<{ visible?: boolean }>) => {
      const { agentId, ...options } = action.payload;
      if (state.agents[agentId]) {
        console.warn("Agent already exists for agentId: ", agentId);
        return;
      }
      const convo = createConversationForAgent(agentId);
      state.conversations[convo.conversationId] = castDraft(convo);
      state.agents[agentId] = createAgentState(convo.conversationId, options);
    },
    destroyAgent: (state, action: AgentPayloadAction) => {
      const { agentId } = action.payload;
      const conversationId = state.agents[agentId]?.conversationId;
      delete state.agents[agentId];
      resetReactionState(state, agentId);
      if (conversationId) {
        evictConversationIfUnused(state, conversationId);
      }
    },
    startNewConversation: (state, action: AgentPayloadAction) => {
      startNewConversationForAgent(state, action.payload.agentId);
    },
    attachAgentToConversation: (
      state,
      action: AgentPayloadAction<{ conversationId: string }>,
    ) => {
      attachAgent(state, action.payload.agentId, action.payload.conversationId);
    },
    setDebugMode: (state, action: PayloadAction<boolean>) => {
      state.debugMode = action.payload;
    },
    markChartSaved: (
      state,
      action: PayloadAction<{ entityId: string; cardId: number }>,
    ) => {
      state.savedChartCardIds[action.payload.entityId] = action.payload.cardId;
    },
    // CONVERSATION REDUCERS
    setConversationTitle: convoReducer(
      (convo, action: ConvoPayloadAction<{ title: string }>) => {
        convo.title = action.payload.title;
      },
    ),
    setIsPollingForTitle: (
      state,
      action: PayloadAction<{
        conversationId: string;
        isPollingForTitle: boolean;
      }>,
    ) => {
      const { conversationId, isPollingForTitle } = action.payload;
      state.titlePollingConversationIds = isPollingForTitle
        ? _.uniq([...state.titlePollingConversationIds, conversationId])
        : state.titlePollingConversationIds.filter(
            (id) => id !== conversationId,
          );
    },
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
        const { id, message, conversationId, externalId, ...rest } =
          action.payload;
        convo.hasMessagedInSession = true;
        const userMessage = startUserMessage(convo, { id, externalId });
        // Unjustified type cast. FIXME
        userMessage.parts.push({ id, role: "user", ...rest, message } as any);
      },
    ),
    startAgentMessage: convoReducer(
      (convo, action: ConvoPayloadAction<{ externalId?: string }>) => {
        startAgentMessage(convo, action.payload.externalId);
      },
    ),
    addAgentMessage: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<
          Omit<MetabotMessagePart, "id" | "role" | "externalId">
        >,
      ) => {
        convo.activeToolCalls = [];
        closeChain(convo);
        // Unjustified type cast. FIXME
        openAgentMessage(convo).parts.push({
          id: createMessageId(),
          role: "agent",
          ...action.payload,
          // transforms in message is making this flakily produce possibly infinite
          // typescript errors. since unused ts-expect-error directives produces
          // errors, casting this as any to avoid having to add / remove constantly.
        } as any);
      },
    ),
    reasoningStart: convoReducer(
      (convo, action: ConvoPayloadAction<{ nowMs?: number }>) => {
        startChainReasoning(convo, action.payload.nowMs);
      },
    ),
    reasoningDelta: convoReducer(
      (convo, action: ConvoPayloadAction<{ text: string; nowMs?: number }>) => {
        appendChainReasoning(convo, action.payload.text, action.payload.nowMs);
      },
    ),
    addAgentTextDelta: convoReducer(
      (convo, action: ConvoPayloadAction<{ text: string; nowMs?: number }>) => {
        const hasToolCalls = convo.activeToolCalls.length > 0;
        const last = openAgentMessage(convo).parts.at(-1);
        const canAppend =
          !hasToolCalls && last?.role === "agent" && last.type === "text";

        if (canAppend) {
          last.message = last.message + action.payload.text;
        } else {
          closeChain(convo, action.payload.nowMs);
          openAgentMessage(convo).parts.push({
            id: createMessageId(),
            role: "agent",
            type: "text",
            message: action.payload.text,
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
          openAgentMessage(convo).externalId = agentMessageId;
        }
        const lastUserTurn = convo.messages.findLast((t) => t.role === "user");
        if (userMessageId && lastUserTurn) {
          lastUserTurn.externalId = userMessageId;
        }
      },
    ),
    toolCallStart: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<{
          toolCallId: string;
          toolName: string;
          title?: string;
          args?: string;
          nowMs?: number;
        }>,
      ) => {
        const { toolCallId, toolName, title, args, nowMs } = action.payload;
        addChainTool(convo, { id: toolCallId, name: toolName, title, nowMs });
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
          title?: string;
          args: string;
          nowMs?: number;
        }>,
      ) => {
        const { toolCallId, toolName, title, args, nowMs } = action.payload;
        addChainTool(convo, { id: toolCallId, name: toolName, title, nowMs });
        const existingMsg = findLastToolCallPart(convo, toolCallId);
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
          nowMs?: number;
        }>,
      ) => {
        convo.activeToolCalls = convo.activeToolCalls.map((tc) =>
          tc.id === action.payload.toolCallId ? { ...tc, status: "ended" } : tc,
        );
        endChainTool(convo, action.payload.toolCallId, action.payload.nowMs);

        // Update the message in messages array with result for debug history
        const message = findLastToolCallPart(convo, action.payload.toolCallId);
        if (message) {
          message.status = "ended";
          message.result = action.payload.result;
          if (action.payload.isError) {
            message.is_error = true;
          }
        }
      },
    ),
    toolCallSearchResults: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<{
          toolCallId: string;
          totalCount: number;
          results: SearchResultItem[];
        }>,
      ) => {
        const { toolCallId, totalCount, results } = action.payload;
        setChainToolSearchResults(convo, toolCallId, { totalCount, results });
      },
    ),
    toolCallTitled: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<{ toolCallId: string; title: string }>,
      ) => {
        const { toolCallId, title } = action.payload;
        setChainToolTitle(convo, toolCallId, title);
      },
    ),
    // only the last turn is rewindable (retry), so a single pre-turn snapshot
    // is enough to roll `state` back; the server reconstructs it independently
    rewindStateToMessageId: convoReducer(
      (convo, action: ConvoPayloadAction<{ messageId: string }>) => {
        convo.isProcessing = false;

        const id = action.payload.messageId;
        const messageIndex = convo.messages.findLastIndex(
          (t) => t.id === id || t.parts.some((p) => p.id === id),
        );
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
    setVisible: agentReducer(
      (agent, action: AgentPayloadAction<{ visible: boolean }>) => {
        agent.visible = action.payload.visible;
      },
    ),
    setMetabotReqIdOverride: convoReducer(
      (convo, action: ConvoPayloadAction<{ id: string | undefined }>) => {
        convo.experimental.metabotReqIdOverride = action.payload.id;
      },
    ),
    setProfileOverride: convoReducer(
      (
        convo,
        action: ConvoPayloadAction<{ profile: MetabotProfileId | undefined }>,
      ) => {
        convo.profileOverride = action.payload.profile;
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
        messages: MetabotMessage[];
        state?: MetabotStateContext;
        activeToolCalls?: MetabotToolCall[];
        conversationId: string;
        title?: string;
        forkedFromConversationId?: string;
      }>,
    ) => {
      const {
        messages = [],
        state: snapshotState,
        activeToolCalls,
        conversationId,
        title,
        forkedFromConversationId,
      } = action.payload;

      const convo =
        state.conversations[conversationId] ??
        castDraft(createConversation({ conversationId }));

      convo.messages = castDraft(
        messages.map((t) => ({ ...t, parts: [...t.parts] })),
      );
      convo.state = snapshotState ?? {};
      convo.activeToolCalls = activeToolCalls ?? [];
      convo.activeChainId = undefined;
      convo.title = title;
      convo.forkedFromConversationId = forkedFromConversationId;
      convo.lastTokenUsage = undefined;
      convo.isProcessing = hasInProgressMessage(messages);
      if (convo.isProcessing) {
        ensureChain(convo); // resuming mid-response
      }
      convo.stateBeforeTurn = undefined;
      state.conversations[conversationId] = convo;

      // NOTE: live reactions aren't reconstructed from a fetched snapshot
      resetReactionStateForConversation(state, conversationId);

      // a snapshot can land after every agent moved on (e.g. rapid history
      // selections) — don't let it resurrect an evicted conversation
      evictConversationIfUnused(state, conversationId);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(logout.pending, (state) => {
        Object.assign(state, getMetabotInitialState());
      })
      // CONVERSATION REQUEST REDUCERS
      .addCase(sendAgentRequest.pending, (state, action) => {
        const convo = getRequestConversation(state, action);
        if (convo) {
          convo.isProcessing = true;
          convo.hasMessagedInSession = true;
          convo.stateBeforeTurn = convo.state;
          convo.activeChainId = undefined;
          startAgentMessage(convo, action.meta.arg.assistant_message_id);
          ensureChain(convo);
        }
      })
      .addCase(sendAgentRequest.fulfilled, (state, action) => {
        const convo = getRequestConversation(state, action);
        if (convo) {
          if (action.payload?.state) {
            convo.state = { ...action.payload.state };
          }

          const metadata = action.payload?.processedResponse.messageMetadata;
          if (metadata?.contextTokens && metadata.contextWindowTokens) {
            convo.lastTokenUsage = {
              contextTokens: metadata.contextTokens,
              contextWindowTokens: metadata.contextWindowTokens,
            };
          }

          const finishReason = action.payload?.processedResponse.finishReason;
          const isResumableFinishReason =
            finishReason && finishReason !== "stop" && finishReason !== "error";
          closeChain(convo);
          openAgentMessage(convo).outcome = isResumableFinishReason
            ? {
                type: "incomplete",
                finishReason,
                contextWindowFull:
                  finishReason === "length" &&
                  isContextWindowFull(convo.lastTokenUsage),
              }
            : { type: "done" };

          convo.activeToolCalls = [];
          convo.isProcessing = false;
          convo.experimental.developerMessage = "";
        }
      })
      .addCase(sendAgentRequest.rejected, (state, action) => {
        const convo = getRequestConversation(state, action);
        if (convo) {
          // the chain lives on the open message, so close it before settling
          closeChain(convo);
          const message = openAgentMessage(convo);

          // aborted requests needs special state adjustments
          if (action.payload?.type === "abort") {
            if (action.payload?.state) {
              convo.state = { ...action.payload.state };
            }
            // an abort means the request (almost certainly) reached the server,
            // so the turn's rows exist under the client-minted id even when the
            // start event never arrived — stamp it so retry can target the prompt
            const lastUserTurn = convo.messages.findLast(
              (t) => t.role === "user",
            );
            if (lastUserTurn && !lastUserTurn.externalId) {
              lastUserTurn.externalId = action.meta.arg.user_message_id;
            }
            message.outcome = { type: "aborted" };
            if (action.payload.unresolved_tool_calls.length > 0) {
              message.parts.forEach((part) => {
                if (part.type === "tool_call" && part.status === "started") {
                  part.status = "ended";
                  part.result = "Tool execution interrupted by user";
                  part.is_error = true;
                }
              });
            }
          } else if (action.payload?.type === "error") {
            message.outcome = {
              type: "errored",
              error: action.payload.error,
              display: action.payload.display,
            };
          }

          convo.activeToolCalls = [];
          convo.isProcessing = false;
        }
      })
      // The URL owns which conversation the full-page ask agent is on: a
      // conversation route attaches the agent, and the new-question ask route
      // starts a fresh conversation. Same-path navigations emit LOCATION_CHANGE
      // too, so re-entering the ask route always resets.
      .addMatcher(isLocationChange, (state, action) => {
        const pathname = action.payload.pathname;
        const convoId = matchPath(
          `/${Urls.CONVERSATION_BASE_PATH}/:convoId`,
          pathname,
        )?.params.convoId;
        if (convoId) {
          attachAgent(state, "ask", convoId);
        } else if (matchPath(Urls.newQuestion({ mode: "ask" }), pathname)) {
          startNewConversationForAgent(state, "ask");
        }
      });
  },
});

export const metabotReducer = metabot.reducer;
export const metabotActions = metabot.actions;
