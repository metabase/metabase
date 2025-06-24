import { t } from "ttag";

import { addAgentMessage, stopProcessing } from "../state";

import type { ReactionHandler } from "./types";

type UnknownReaction = { type: string } & Record<string, unknown>;

export const notifyUnknownReaction: ReactionHandler<UnknownReaction> = (
  reaction,
) => {
  return ({ dispatch }) => {
    console.error("Unknown reaction recieved", reaction);
    dispatch(
      addAgentMessage({
        type: "error",
        message: t`Whoops, I actually can’t do this. Sorry.`,
      }),
    );
    dispatch(stopProcessing());
  };
};
