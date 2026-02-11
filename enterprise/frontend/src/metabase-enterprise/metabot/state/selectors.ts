import { createSelector } from "@reduxjs/toolkit";
import { match } from "ts-pattern";
import _ from "underscore";

import { getIsEmbedding } from "metabase/selectors/embed";
import { getLocation } from "metabase/selectors/routing";
import { Urls } from "metabase-enterprise/urls";
import type { TransformId } from "metabase-types/api";

import {
  FIXED_METABOT_IDS,
  LONG_CONVO_MSG_LENGTH_THRESHOLD,
  METABOT_REQUEST_IDS,
} from "../constants";

import type {
  MetabotAgentId,
  MetabotStoreState,
  MetabotUserChatMessage,
} from "./types";

/*
 * Top Level Selectors
 */

export const getMetabotState = (state: MetabotStoreState) => {
  return state.plugins.metabotPlugin;
};

export const getActiveMetabotAgentIds = createSelector(
  getMetabotState,
  (state) => Object.keys(state.conversations) as MetabotAgentId[],
);

export const getMetabotId = createSelector(getIsEmbedding, (isEmbedding) =>
  isEmbedding ? FIXED_METABOT_IDS.EMBEDDED : FIXED_METABOT_IDS.DEFAULT,
);

export const getDebugMode = createSelector(
  getMetabotState,
  (state) => state.debugMode,
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

const getAgentId = (_: MetabotStoreState, agentId: MetabotAgentId) => agentId;

export const getMetabotConversation = createSelector(
  [getMetabotState, getAgentId],
  (state, agentId) => {
    const convo = state.conversations[agentId];
    if (!convo) {
      throw new Error(`No conversation exists for agent: ${agentId}`);
    }
    return convo;
  },
);

export const getMetabotVisible = createSelector(
  getMetabotConversation,
  (convo) => convo.visible,
);

const getInternalMessages = createSelector(
  getMetabotConversation,
  (convo) => convo.messages,
);

export const getMessages = createSelector(
  [getInternalMessages, getDebugMode],
  (messages, debugMode) => {
    return debugMode
      ? messages
      : messages.filter((msg) => msg.type !== "tool_call");
  },
);

export const getDeveloperMessage = createSelector(
  getMetabotConversation,
  (convo) => convo.experimental.developerMessage,
);

export const getActiveToolCalls = createSelector(
  getMetabotConversation,
  (convo) => convo.activeToolCalls,
);

export const getLastMessage = createSelector(getMessages, (messages) =>
  _.last(messages),
);

export const getAgentErrorMessages = createSelector(
  getMetabotConversation,
  (convo) => convo.errorMessages,
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

export const getIsProcessing = createSelector(
  getMetabotConversation,
  (convo) => convo.isProcessing,
);

export const getHistory = createSelector(
  getMetabotConversation,
  (convo) => convo.history,
);

export const getMetabotRequestState = createSelector(
  getMetabotConversation,
  (convo) => convo.state,
);

export const getIsLongMetabotConversation = createSelector(
  getMessages,
  (messages) => {
    const totalMessageLength = messages.reduce((sum, msg) => {
      return sum + ("message" in msg ? msg.message.length : 0);
    }, 0);
    return totalMessageLength >= LONG_CONVO_MSG_LENGTH_THRESHOLD;
  },
);

export const getMetabotReqIdOverride = createSelector(
  getMetabotConversation,
  (convo) => convo.experimental.metabotReqIdOverride,
);

export const getMetabotRequestId = createSelector(
  getMetabotReqIdOverride,
  getIsEmbedding,
  (metabotReqIdOverride, isEmbedding) =>
    metabotReqIdOverride ??
    (isEmbedding ? METABOT_REQUEST_IDS.EMBEDDED : undefined),
);

export const getProfileOverride = createSelector(
  getMetabotConversation,
  (convo) => convo.profileOverride,
);

export const getProfile = createSelector(
  [getProfileOverride, getDebugMode, getLocation],
  (profileOverride, debugMode, location) => {
    const isTransformsPage = location.pathname.startsWith(Urls.transformList());
    return match({ debugMode, isTransformsPage })
      .with(
        { debugMode: false, isTransformsPage: true },
        () => "transforms_codegen",
      )
      .with(
        { debugMode: true, isTransformsPage: true },
        () => profileOverride ?? "transforms_codegen",
      )
      .otherwise(() => profileOverride);
  },
);

export const getAgentRequestMetadata = createSelector(
  getHistory,
  getMetabotRequestState,
  getProfile,
  (history, state, profile) => ({
    state,
    // NOTE: need end to end support for ids on messages as BE will error if ids are present
    history: history.map((h) =>
      h.id && h.id.startsWith(`msg_`) ? _.omit(h, "id") : h,
    ),
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
