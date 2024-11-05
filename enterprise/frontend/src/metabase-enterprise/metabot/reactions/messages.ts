import type {
  MetabotConfirmationReaction,
  MetabotMessageReaction,
} from "metabase-types/api";

import { addUserMessage, setConfirmationOptions } from "../state";

import type { ReactionHandler } from "./types";

export const showMessage: ReactionHandler<
  MetabotMessageReaction
> = reaction => {
  return ({ dispatch }) => {
    dispatch(addUserMessage(reaction.message));
  };
};

export const requireUserConfirmation: ReactionHandler<
  MetabotConfirmationReaction
> = reaction => {
  return ({ dispatch }) => {
    dispatch(addUserMessage(reaction.description));
    dispatch(setConfirmationOptions(reaction.options));
  };
};
