import { t } from "ttag";

import { addUserMessage, clearUserMessages } from "../state";

import type { ReactionHandler } from "./types";

type UnknownReaction = { type: string } & Record<string, unknown>;

export const notifyUnknownReaction: ReactionHandler<UnknownReaction> = (
  reaction,
) => {
  return ({ dispatch }) => {
    console.error("Unknown reaction recieved", reaction);
    dispatch(clearUserMessages());
    dispatch(addUserMessage(t`Whoops, I actually can’t do this. Sorry.`));
  };
};
