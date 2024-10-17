import { createSelector } from "@reduxjs/toolkit";

import { metabotAgent } from "metabase-enterprise/api";
import type {
  ChatMessage,
  MetabotChatMessage,
  UserChatMessage,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { MetabotStoreState } from "./types";

export const getMetabot = (state: MetabotStoreState) =>
  state.plugins.metabotPlugin;

export const getContext = createSelector(
  getMetabot,
  metabot => metabot.chat.context,
);

export const getHistory = createSelector(
  getMetabot,
  metabot => metabot.chat.history,
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

export const getSendMessageReq = (state: State) =>
  // @ts-expect-error - TODO: find / create State type with metaboat RTK data included
  metabotAgent.select("metabot")(state);
