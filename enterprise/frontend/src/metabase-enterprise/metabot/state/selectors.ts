import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import {
  type ChatMessage,
  type MetabotChatMessage,
  type UserChatMessage,
  isMetabotChatMessage,
  isUserChatMessage,
} from "metabase-types/api";

import type { MetabotStoreState } from "./types";

export const getMetabot = (state: MetabotStoreState) =>
  state.plugins.metabotPlugin;

export const getHistory = createSelector(
  getMetabot,
  metabot => metabot.chatHistory,
);

export const getLastMetabotChatMessages = createSelector(
  getMetabot,
  (metabot): MetabotChatMessage[] => {
    const lastMessage = _.last(metabot.chatHistory);
    if (lastMessage && isUserChatMessage(lastMessage)) {
      return [];
    } else {
      const lastUserMessageIndex =
        metabot.chatHistory.findLastIndex(isUserChatMessage);
      return metabot.chatHistory
        .slice(lastUserMessageIndex + 1)
        .filter(isMetabotChatMessage);
    }
  },
);

export const getChatHistory = createSelector(
  getHistory,
  (history: ChatMessage[]) => {
    return history.filter(
      (msg): msg is UserChatMessage | MetabotChatMessage =>
        msg.source === "user" ||
        (msg.source === "llm" && msg.llm_response_type === "message"),
    );
  },
);
