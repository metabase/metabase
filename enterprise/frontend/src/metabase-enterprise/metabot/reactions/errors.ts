import { t } from "ttag";

import { addAgentMessage, clearMessages } from "../state";

import type { ReactionHandler } from "./types";

type UnknownReaction = { type: string } & Record<string, unknown>;

export const notifyUnknownReaction: ReactionHandler<UnknownReaction> = (
  reaction,
) => {
  return ({ dispatch }) => {
    console.error("Unknown reaction recieved", reaction);
    dispatch(clearMessages());
    dispatch(addAgentMessage(t`Whoops, I actually can’t do this. Sorry.`));
  };
};
