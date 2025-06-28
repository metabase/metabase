import type { MetabotMessageReaction } from "metabase-types/api";

import { addAgentMessage } from "../state";

import type { ReactionHandler } from "./types";

export const showMessage: ReactionHandler<MetabotMessageReaction> = (
  reaction,
) => {
  return ({ dispatch }) => {
    dispatch(addAgentMessage({ message: reaction.message }));
  };
};
