import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import type { MetabotStoreState } from "./types";

export const LONG_CONVO_MSG_LENGTH_THRESHOLD = 120000;

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
