import type { MetabotMessageReaction } from "metabase-types/api";

import { addUserMessage } from "../state";

import type { ReactionHandler } from "./types";

export const showMessage: ReactionHandler<MetabotMessageReaction> = (
  reaction,
) => {
  return ({ dispatch }) => {
    dispatch(addUserMessage(reaction.message));
  };
};
