import { createSelector } from "@reduxjs/toolkit";
import { match } from "ts-pattern";

import { isEmbedding } from "metabase/embedding/config";
import type { State } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import type { TransformId } from "metabase-types/api";

import {
  CONTEXT_WINDOW_WARNING_PERCENT,
  FIXED_METABOT_IDS,
  METABOT_REQUEST_IDS,
  type MetabotProfileId,
} from "../constants";
import {
  getContextWindowPercentUsage,
  isContextWindowFull,
} from "../utils/context-usage";

import type {
  MetabotAgentId,
  MetabotContextUsage,
  MetabotMessage,
} from "./types";
import { hasInProgressMessage, isGeneratedCardPart, isTextPart } from "./utils";

/*
 * Top Level Selectors
 */

export const getMetabotState = (state: State) => {
  return state.metabot;
};

export const getActiveMetabotAgentIds = createSelector(
  getMetabotState,
  // Unjustified type cast. FIXME
  (state) => Object.keys(state.agents) as MetabotAgentId[],
);

export const getMetabotId = () =>
  isEmbedding() ? FIXED_METABOT_IDS.EMBEDDED : FIXED_METABOT_IDS.DEFAULT;

export const getDebugMode = createSelector(
  getMetabotState,
  (state) => state.debugMode,
);

export const getSavedChartCardId = createSelector(
  [getMetabotState, (_state: State, entityId: string) => entityId],
  (metabotState, entityId): number | undefined =>
    metabotState.savedChartCardIds[entityId],
);

export const getMetabotReactionsState = createSelector(
  getMetabotState,
  (state) => state.reactions,
);

export const getNavigateToPath = createSelector(
  getMetabotReactionsState,
  (reactionsState) => reactionsState.navigateToPath,
);

export const getMetabotSuggestedTransforms = createSelector(
  getMetabotReactionsState,
  (reactionsState) => reactionsState.suggestedTransforms,
);

export const getMetabotSuggestedTransform = createSelector(
  [
    getMetabotSuggestedTransforms,
    (_, transformId?: TransformId) => transformId,
  ],
  (suggestedTransforms, transformId) => {
    return suggestedTransforms.findLast(
      (t) => t.id === transformId && t.active,
    );
  },
);

export const getIsSuggestedTransformActive = createSelector(
  [getMetabotSuggestedTransforms, (_, suggestionId: string) => suggestionId],
  (suggestedTransforms, suggestionId) => {
    const suggestion = suggestedTransforms.find(
      (t) => t.suggestionId === suggestionId,
    );
    return suggestion?.active ?? false;
  },
);

/*
 * Conversation Selectors
 */

const getAgentId = (_: State, agentId: MetabotAgentId) => agentId;

export const getMetabotAgent = createSelector(
  [getMetabotState, getAgentId],
  (state, agentId) => {
    const agent = state.agents[agentId];
    if (!agent) {
      throw new Error(`No metabot agent exists: ${agentId}`);
    }
    return agent;
  },
);

export const getMetabotConversationId = createSelector(
  getMetabotAgent,
  (agent) => agent.conversationId,
);

export const getMetabotConversation = createSelector(
  [getMetabotState, getMetabotConversationId],
  (state, conversationId) => {
    const convo = state.conversations[conversationId];
    if (!convo) {
      throw new Error(`No conversation exists: ${conversationId}`);
    }
    return convo;
  },
);

export const getHasConversation = (state: State, conversationId: string) =>
  Boolean(getMetabotState(state).conversations[conversationId]);

export const getMetabotVisible = createSelector(
  getMetabotAgent,
  (agent) => agent.visible,
);

export const getConversation = createSelector(
  [getMetabotState, (_state: State, conversationId: string) => conversationId],
  (state, conversationId) => {
    const convo = state.conversations[conversationId];
    if (!convo) {
      throw new Error(`No conversation exists: ${conversationId}`);
    }
    return convo;
  },
);

export const getConversationTitle = createSelector(
  getConversation,
  (convo) => convo.title,
);

export const getMessages = createSelector(
  getConversation,
  (convo) => convo.messages,
);

export const getIsConversationEmpty = createSelector(
  getMessages,
  (messages) => messages.length === 0,
);

export const getConversationForkedFrom = createSelector(
  getConversation,
  (convo) => convo.forkedFromConversationId,
);

export const getIsPollingForTitle = createSelector(
  [
    (state: State) => getMetabotState(state).titlePollingConversationIds,
    (_state: State, conversationId: string) => conversationId,
  ],
  (conversationIds, conversationId) => conversationIds.includes(conversationId),
);

export const getDeveloperMessage = createSelector(
  getConversation,
  (convo) => convo.experimental.developerMessage,
);

export const getActiveToolCalls = createSelector(
  getConversation,
  (convo) => convo.activeToolCalls,
);

export const getLastAgentMessageExternalId = createSelector(
  getMessages,
  (messages) => messages.findLast((t) => t.role === "agent")?.externalId,
);

export const getFinalChartMessageIdsPerTurn = createSelector(
  getMessages,
  (messages) =>
    new Set(
      messages.flatMap((message) => {
        const lastChart = message.parts.findLast(isGeneratedCardPart);
        return lastChart ? [lastChart.id] : [];
      }),
    ),
);

/**
 * The user message that prompted `messageId` — the message itself when `messageId`
 * addresses a user message or one of its parts, otherwise the nearest preceding
 * one. Retry and rewind both target the message, since that is what the server
 * regenerates.
 */
export const getUserPromptMessage = createSelector(
  [getMessages, (_, __, messageId: string) => messageId],
  (messages, messageId): MetabotMessage | undefined => {
    const messageIndex = messages.findLastIndex(
      (t) => t.id === messageId || t.parts.some((p) => p.id === messageId),
    );
    if (messageIndex === -1) {
      return undefined;
    }
    return messages[messageIndex].role === "user"
      ? messages[messageIndex]
      : messages.slice(0, messageIndex).findLast((t) => t.role === "user");
  },
);

export const getPromptText = (message: MetabotMessage) =>
  message.parts.find(isTextPart)?.message ?? "";

export const getMessageIdToRewind = createSelector(
  [getMessages],
  (messages) => {
    if (messages.at(-1)?.status.type !== "errored") {
      return undefined;
    }
    const promptMessage = messages.findLast((t) => t.role === "user");
    return promptMessage?.parts.at(0)?.id;
  },
);

export const getIsConversationProcessing = createSelector(
  getConversation,
  (convo) => convo.isProcessing,
);

export const getIsConversationInProgress = createSelector(
  getMessages,
  hasInProgressMessage,
);

export const getMetabotRequestState = createSelector(
  getConversation,
  (convo) => convo.state,
);

export const getConversationChart = createSelector(
  [getMetabotState, (_state: State, chartId: string) => chartId],
  (metabotState, chartId): Urls.ConversationChart | undefined => {
    const charts = Object.values(metabotState.conversations)
      .map((convo) => convo?.state?.charts?.[chartId])
      .filter((chart) => chart != null);
    return charts.find(Urls.hasLinkableChartQuery) ?? charts[0];
  },
);

export type MetabotLongChatNoticeVariant = "warning" | "full";

export const getContextUsage = createSelector(
  [getMessages, getConversation],
  (messages, convo): MetabotContextUsage | undefined => {
    const contextTokens = messages.findLast(
      (m) => m.role === "agent" && m.contextTokens,
    )?.contextTokens;
    const { contextWindowTokens } = convo;
    return contextTokens && contextWindowTokens
      ? { contextTokens, contextWindowTokens }
      : undefined;
  },
);

export const getContextUsagePercent = createSelector(
  getContextUsage,
  getContextWindowPercentUsage,
);

export const getLongChatNotice = createSelector(
  [getContextUsage, getContextUsagePercent],
  (contextUsage, percentUsage): MetabotLongChatNoticeVariant | undefined => {
    if (isContextWindowFull(contextUsage)) {
      return "full";
    }
    return percentUsage >= CONTEXT_WINDOW_WARNING_PERCENT
      ? "warning"
      : undefined;
  },
);

export const getMetabotReqIdOverride = createSelector(
  getConversation,
  (convo) => convo.experimental.metabotReqIdOverride,
);

export const getMetabotRequestId = (state: State, conversationId: string) =>
  getMetabotReqIdOverride(state, conversationId) ??
  (isEmbedding() ? METABOT_REQUEST_IDS.EMBEDDED : undefined);

export const getProfileOverride = createSelector(
  getConversation,
  (convo) => convo.profileOverride,
);

export const getProfile = (
  state: State,
  conversationId: string,
  isTransformsPage: boolean,
): MetabotProfileId | undefined => {
  const profileOverride = getProfileOverride(state, conversationId);
  const debugMode = getDebugMode(state);
  return match({ debugMode, isTransformsPage })
    .returnType<MetabotProfileId | undefined>()
    .with(
      { debugMode: false, isTransformsPage: true },
      () => "transforms_codegen",
    )
    .with(
      { debugMode: true, isTransformsPage: true },
      () => profileOverride ?? "transforms_codegen",
    )
    .otherwise(() => profileOverride);
};

export const getAgentRequestMetadata = createSelector(
  [
    (
      state: State,
      conversationId: string,
      _retryMessageId: string | undefined,
      isTransformsPage: boolean,
    ) => getProfile(state, conversationId, isTransformsPage),
    getLastAgentMessageExternalId,
    (
      _state: State,
      _conversationId: string,
      retryMessageId: string | undefined,
    ) => retryMessageId,
  ],
  (profile, parentMessageId, retryMessageId) => ({
    // a retry regenerates the response to an existing message, so it carries
    // retry_message_id in place of parent_message_id — never both
    ...(retryMessageId
      ? { retry_message_id: retryMessageId }
      : { parent_message_id: parentMessageId }),
    ...(profile ? { profile_id: profile } : {}),
  }),
);

export const getMetabotSuggestedCodeEdits = createSelector(
  getMetabotReactionsState,
  (reactionsState) => reactionsState.suggestedCodeEdits,
);

export const getMetabotSuggestedCodeEdit = createSelector(
  [getMetabotSuggestedCodeEdits, (_, bufferId: string) => bufferId],
  (suggestedCodeEdits, bufferId) => suggestedCodeEdits[bufferId],
);
