import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { getIsEmbedding } from "metabase/selectors/embed";
import { getLocation } from "metabase/selectors/routing";

import {
  FIXED_METABOT_IDS,
  LONG_CONVO_MSG_LENGTH_THRESHOLD,
  METABOT_REQUEST_IDS,
} from "../constants";

import type { MetabotStoreState } from "./types";

export const getMetabot = (state: MetabotStoreState) => {
  return state.plugins.metabotPlugin;
};

export const getMetabotVisible = createSelector(
  getMetabot,
  (metabot) => metabot.visible,
);

export const getMessages = createSelector(
  getMetabot,
  (metabot) => metabot.messages,
);

export const getToolCalls = createSelector(
  getMetabot,
  (metabot) => metabot.toolCalls,
);

export const getLastMessage = createSelector(getMessages, (messages) =>
  _.last(messages),
);

export const getAgentErrorMessages = createSelector(
  getMetabot,
  (metabot) => metabot.errorMessages,
);

// if the message id provided is an agent id the first user message
// that precedes it will be returned. if a user message id is provided
// that exact message will be returned.
export const getUserPromptForMessageId = createSelector(
  [getMessages, (_, messageId: string) => messageId],
  (messages, messageId) => {
    const messageIndex = messages.findLastIndex((m) => m.id === messageId);
    const message = messages[messageIndex];
    if (!message) {
      return undefined;
    }

    if (message.role === "user") {
      return message;
    } else {
      return messages.slice(0, messageIndex).findLast((m) => m.role === "user");
    }
  },
);

export const getLastAgentMessagesByType = createSelector(
  [getMessages, getAgentErrorMessages],
  (messages, errorMessages) => {
    if (errorMessages.length > 0) {
      return errorMessages.map(({ message }) => message);
    }

    const start = messages.findLastIndex((msg) => msg.role !== "agent") + 1;
    return messages.slice(start).map(({ message }) => message);
  },
);

export const getIsProcessing = createSelector(
  getMetabot,
  (metabot) => metabot.isProcessing,
);

export const getHistory = createSelector(
  getMetabot,
  (metabot) => metabot.history,
);

export const getMetabotConversationId = createSelector(
  getMetabot,
  (metabot) => metabot.conversationId,
);

export const getMetabotState = createSelector(
  getMetabot,
  (metabot) => metabot.state,
);

export const getMetabotReactionsState = createSelector(
  getMetabot,
  (metabot) => metabot.reactions,
);

export const getIsLongMetabotConversation = createSelector(
  getMessages,
  (messages) => {
    const totalMessageLength = messages.reduce((sum, msg) => {
      return sum + msg.message.length;
    }, 0);
    return totalMessageLength >= LONG_CONVO_MSG_LENGTH_THRESHOLD;
  },
);

export const getMetabotId = createSelector(getIsEmbedding, (isEmbedding) =>
  isEmbedding ? FIXED_METABOT_IDS.EMBEDDED : FIXED_METABOT_IDS.DEFAULT,
);

export const getMetabotReqIdOverride = createSelector(
  getMetabot,
  (metabot) => metabot.experimental.metabotReqIdOverride,
);

export const getMetabotRequestId = createSelector(
  getMetabotReqIdOverride,
  getIsEmbedding,
  (metabotReqIdOverride, isEmbedding) =>
    metabotReqIdOverride ??
    (isEmbedding ? METABOT_REQUEST_IDS.EMBEDDED : undefined),
);

export const getProfileOverride = createSelector(
  getMetabot,
  (metabot) => metabot.experimental.profileOverride,
);

export const getProfile = createSelector(
  getProfileOverride,
  getLocation,
  (profileOverride, location) => {
    if (profileOverride) {
      return profileOverride;
    }

    return location.pathname.startsWith("/admin/transforms")
      ? "transforms_codegen"
      : undefined;
  },
);

export const getAgentRequestMetadata = createSelector(
  getHistory,
  getMetabotState,
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

export const getNavigateToPath = createSelector(
  getMetabotReactionsState,
  (reactionsState) => reactionsState.navigateToPath,
);

export const getMetabotSuggestedTransform = createSelector(
  getMetabotReactionsState,
  (reactionsState) => ({
    transformQueryUpdateId: reactionsState.transformQueryUpdateId,
    transformQuery: reactionsState.transformQuery,
  }),
);
