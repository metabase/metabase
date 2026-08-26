import { createSelector } from "@reduxjs/toolkit";
import { match } from "ts-pattern";
import _ from "underscore";

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
  MetabotChatMessage,
  MetabotUserChatMessage,
} from "./types";
import { hasInProgressMessage } from "./utils";

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

export const getLastMessage = createSelector(getMessages, (messages) =>
  _.last(messages),
);

export const getLastAgentMessageExternalId = createSelector(
  getMessages,
  (messages) => {
    const lastAgentMessage = messages.findLast(
      (m) => m.role === "agent" && "externalId" in m,
    );
    return lastAgentMessage && "externalId" in lastAgentMessage
      ? lastAgentMessage.externalId
      : undefined;
  },
);

const splitByTurn = (messages: MetabotChatMessage[]): MetabotChatMessage[][] =>
  messages.reduce<MetabotChatMessage[][]>((turns, m) => {
    if (m.role === "user" || turns.length === 0) {
      turns.push([m]);
    } else {
      turns[turns.length - 1].push(m);
    }
    return turns;
  }, []);

export const getFinalChartMessageIdsPerTurn = createSelector(
  getMessages,
  (messages) =>
    new Set(
      splitByTurn(messages).flatMap((turn) => {
        const lastChart = turn.findLast(
          (m) =>
            m.type === "data_part" &&
            m.part.type === "data-generated_entity" &&
            m.part.data.type === "card",
        );
        return lastChart ? [lastChart.id] : [];
      }),
    ),
);

// if the message id provided is an agent id the first user message
// that precedes it will be returned. if a user message id is provided
// that exact message will be returned.
export const getUserPromptForMessageId = createSelector(
  [getMessages, (_, __, messageId: string) => messageId],
  (messages, messageId): MetabotUserChatMessage | undefined => {
    const messageIndex = messages.findLastIndex((m) => m.id === messageId);
    const message = messages[messageIndex];
    if (!message) {
      return undefined;
    }

    if (message.role === "user") {
      return message;
    } else {
      return messages
        .slice(0, messageIndex)
        .findLast<MetabotUserChatMessage>((m) => m.role === "user");
    }
  },
);

export const getMessageIdToRewind = createSelector(
  [getMessages],
  (messages) => {
    const lastMessage = messages.at(-1);
    if (lastMessage?.type === "turn_errored") {
      return messages.findLast((m) => m.role === "user")?.id;
    }
    return undefined;
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

export const getConversationStateById = createSelector(
  [getMetabotState, (_state: State, conversationId: string) => conversationId],
  (metabotState, conversationId) =>
    metabotState.conversations[conversationId]?.state,
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

export const getContextUsagePercent = createSelector(
  [getConversation],
  (convo): number => getContextWindowPercentUsage(convo.lastTokenUsage),
);

export const getLongChatNotice = createSelector(
  [getConversation, getContextUsagePercent],
  (convo, percentUsage): MetabotLongChatNoticeVariant | undefined => {
    if (isContextWindowFull(convo.lastTokenUsage)) {
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
