import type { MetabotWriteBackReaction } from "metabase-types/api";

import { sendWritebackMessageRequest } from "../state";

import type { ReactionHandler } from "./types";

export const writeBack: ReactionHandler<
  MetabotWriteBackReaction
> = reaction => {
  return async ({ dispatch }) => {
    await dispatch(sendWritebackMessageRequest(reaction.message));
  };
};
