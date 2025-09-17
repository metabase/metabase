import { t } from "ttag";

import { addAgentErrorMessage, stopProcessing } from "../state";

import type { ReactionHandler } from "./types";

type UnknownReaction = { type: string } & Record<string, unknown>;

export const notifyUnknownReaction: ReactionHandler<UnknownReaction> = (
  reaction,
) => {
  return ({ dispatch }) => {
    console.error("Unknown reaction recieved", reaction);
    dispatch(
      addAgentErrorMessage({
        type: "message",
        message: t`Whoops, I actually can’t do this. Sorry.`,
      }),
    );
    dispatch(stopProcessing());
  };
};
