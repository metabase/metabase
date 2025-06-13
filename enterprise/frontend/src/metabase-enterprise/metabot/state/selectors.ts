import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { getIsEmbedding } from "metabase/selectors/embed";
import { METABOT_TAG, metabotApi } from "metabase-enterprise/api";

import {
  FIXED_METABOT_IDS,
  LONG_CONVO_MSG_LENGTH_THRESHOLD,
} from "../constants";

import type { MetabotStoreState } from "./types";

export const getMetabot = (state: MetabotStoreState) =>
  state.plugins.metabotPlugin;

export const getMetabotVisible = createSelector(
  getMetabot,
  (metabot) => metabot.visible,
);

export const getMessages = createSelector(
  getMetabot,
  (metabot) => metabot.messages,
);

export const getLastAgentMessagesByType = createSelector(
  getMessages,
  (messages) => {
    const lastMessage = _.last(messages);
    if (!lastMessage || lastMessage.actor === "user") {
      return [];
    }

    const start =
      messages.findLastIndex(
        (msg) => msg.actor !== "agent" || msg.type !== lastMessage.type,
      ) + 1;
    return messages.slice(start).map(({ message }) => message);
  },
);

export const getIsProcessing = createSelector(
  getMetabot,
  (metabot) => metabot.isProcessing,
);

export const getLastSentContext = createSelector(
  getMetabot,
  (metabot) => metabot.lastSentContext,
);

export const getMetabotConversationId = createSelector(
  getMetabot,
  (metabot) => metabot.conversationId,
);

export const getMetabotState = createSelector(
  getMetabot,
  (metabot) => metabot.state,
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

export const getPrevAgentResponse = metabotApi.endpoints.metabotAgent.select({
  requestId: undefined,
  fixedCacheKey: METABOT_TAG,
});

/**
 * Used to access values like history + state from the previous request
 * which are meant to be repeated back on future requests
 */
export const getPrevAgentRequestMeta = createSelector(
  getPrevAgentResponse,
  (res) => {
    return {
      state: res.data?.state ?? {},
      history: res.data?.history ?? [],
    };
  },
);
