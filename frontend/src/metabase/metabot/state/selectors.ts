import { createSelector } from "@reduxjs/toolkit";
import { match } from "ts-pattern";
import _ from "underscore";

import { isEmbedding } from "metabase/embedding/config";
import type { State } from "metabase/redux/store";
import { getLocation } from "metabase/selectors/routing";
import * as Urls from "metabase/urls";
import type { TransformId } from "metabase-types/api";

import {
  FIXED_METABOT_IDS,
  LONG_CONVO_MSG_LENGTH_THRESHOLD,
  METABOT_REQUEST_IDS,
  type MetabotProfileId,
} from "../constants";

import type {
  MetabotAgentId,
  MetabotChatMessage,
  MetabotUserChatMessage,
} from "./types";

/*
 * Top Level Selectors
 */

export const getMetabotState = (state: State) => {
  return state.metabot;
};

export const getActiveMetabotAgentIds = createSelector(
  getMetabotState,
  (state) => Object.keys(state.conversations) as MetabotAgentId[],
);

export const getBarChatAgentIds = createSelector(getMetabotState, (state) =>
  (
    Object.entries(state.conversations) as Array<
      [MetabotAgentId, (typeof state.conversations)[MetabotAgentId]]
    >
  )
    .filter(
      ([id, convo]) =>
        id.startsWith("chat_") &&
        convo?.inBar === true &&
        id !== state.overlayAgentId,
    )
    .map(([id]) => id),
);

export const getOverlayAgentId = createSelector(
  getMetabotState,
  (state) => state.overlayAgentId,
);

export type ActiveChatConversation = {
  conversationId: string;
  title: string | null;
  isProcessing: boolean;
  hasUnreadResponse: boolean;
  isVisible: boolean;
  isExpanded: boolean;
};

/** Lightweight projection of the in-memory chat conversations, used by the
 * sidebar threads list to surface a conversation (with a loader) as soon as it
 * starts streaming, before it has been persisted/refetched from the API. */
export const getActiveChatConversations = createSelector(
  getMetabotState,
  (state): ActiveChatConversation[] =>
    (
      Object.entries(state.conversations) as Array<
        [MetabotAgentId, (typeof state.conversations)[MetabotAgentId]]
      >
    )
      .filter(([id]) => id.startsWith("chat_"))
      .map(([id, convo]) => ({
        conversationId: id.slice("chat_".length),
        title: convo?.title ?? null,
        isProcessing: convo?.isProcessing ?? false,
        hasUnreadResponse: convo?.hasUnreadResponse ?? false,
        isVisible: convo?.visible ?? false,
        isExpanded: state.overlayAgentId === id,
      })),
);

export const getVisibleAgentId = createSelector(
  getMetabotState,
  (state): MetabotAgentId | null => {
    const entries = Object.entries(state.conversations) as Array<
      [MetabotAgentId, (typeof state.conversations)[MetabotAgentId]]
    >;
    const visible = entries.find(([id, convo]) => {
      if (!convo?.visible || !convo?.inBar) {
        return false;
      }
      return id.startsWith("chat_");
    });
    return visible ? visible[0] : null;
  },
);

export const getMetabotId = () =>
  isEmbedding() ? FIXED_METABOT_IDS.EMBEDDED : FIXED_METABOT_IDS.DEFAULT;

export const getDebugMode = createSelector(
  getMetabotState,
  (state) => state.debugMode,
);

export const getMetabotReactionsState = createSelector(
  getMetabotState,
  (state) => state.reactions,
);

export const getCurrentQuestionPath = createSelector(
  getMetabotReactionsState,
  (reactionsState) => reactionsState.currentQuestionPath,
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

export const getPrompt = createSelector(
  getMetabotConversation,
  (convo) => convo.prompt,
);

export const getConversationTitle = createSelector(
  getMetabotConversation,
  (convo) => convo.title,
);

export const getPromptFocusToken = createSelector(
  getMetabotConversation,
  (convo) => convo.promptFocusToken,
);

export const getMessages = createSelector(
  getMetabotConversation,
  (convo) => convo.messages,
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

const splitByTurn = (messages: MetabotChatMessage[]): MetabotChatMessage[][] =>
  messages.reduce<MetabotChatMessage[][]>((turns, m) => {
    if (m.role === "user" || turns.length === 0) {
      turns.push([m]);
    } else {
      turns[turns.length - 1].push(m);
    }
    return turns;
  }, []);

// The agent may emit several `adhoc_viz` parts mid-turn (e.g. while iterating on
// a query); only the last one per turn represents the final chart to surface.
export const getFinalAdhocVizMessageIdsPerTurn = createSelector(
  getMessages,
  (messages) =>
    new Set(
      splitByTurn(messages).flatMap((turn) => {
        const lastViz = turn.findLast(
          (m) => m.type === "data_part" && m.part.type === "adhoc_viz",
        );
        return lastViz ? [lastViz.id] : [];
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

export const getMetabotRequestId = (state: State, agentId: MetabotAgentId) => {
  const metabotReqIdOverride = getMetabotReqIdOverride(state, agentId);
  return (
    metabotReqIdOverride ??
    (isEmbedding() ? METABOT_REQUEST_IDS.EMBEDDED : undefined)
  );
};

export const getProfileOverride = createSelector(
  getMetabotConversation,
  (convo) => convo.profileOverride,
);

export const getModelOverride = createSelector(
  getMetabotConversation,
  (convo) => convo.modelOverride,
);

export const getSelectedDatabaseId = createSelector(
  getMetabotConversation,
  (convo) => convo.selectedDatabaseId,
);

export const getProfile = createSelector(
  [getProfileOverride, getDebugMode, getLocation],
  (profileOverride, debugMode, location): MetabotProfileId | undefined => {
    const isTransformsPage = location.pathname.startsWith(Urls.transformList());
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
  },
);

export const getAgentRequestMetadata = createSelector(
  getHistory,
  getMetabotRequestState,
  getProfile,
  getModelOverride,
  getSelectedDatabaseId,
  (history, state, profile, model, databaseId) => ({
    state,
    // NOTE: need end to end support for ids on messages as BE will error if ids are present
    history: history.map((h) =>
      h.id && h.id.startsWith(`msg_`) ? _.omit(h, "id") : h,
    ),
    ...(model ? { model } : {}),
    ...(profile ? { profile_id: profile } : {}),
    ...(databaseId != null ? { database_id: databaseId } : {}),
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
