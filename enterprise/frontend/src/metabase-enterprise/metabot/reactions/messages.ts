import type { MetabotMessageReaction } from "metabase-types/api";

import { addAgentMessage } from "../state";

import type { ReactionHandler } from "./types";

export const showMessage: ReactionHandler<MetabotMessageReaction> = (
  reaction,
) => {
  return ({ dispatch }) => {
    dispatch(addAgentMessage({ type: "reply", message: reaction.message }));
  };
};
