import { t } from "ttag";

import { addUserMessage, clearUserMessages } from "../state";

import type { ReactionHandler } from "./types";

type UnknownReaction = { type: string } & Record<string, unknown>;

export const notifyUnknownReaction: ReactionHandler<
  UnknownReaction
> = reaction => {
  return ({ dispatch }) => {
    console.error("Unknown reaction recieved", reaction);

    dispatch(clearUserMessages());
    dispatch(
      addUserMessage(
        t`Oops! I'm unable to finish this task. Please contact support.`,
      ),
    );
  };
};

export const notifyUnkownError: ReactionHandler<void> = () => {
  return ({ dispatch }) => {
    dispatch(clearUserMessages());
    dispatch(
      addUserMessage(
        t`Oops! Something went wrong, I won't be able to fulfill that request.`,
      ),
    );
  };
};
