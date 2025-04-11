import type { MetabotReaction } from "metabase-types/api";

import { showMessage } from "./messages";
import { redirect } from "./metabot";
import type { ReactionHandler } from "./types";

export * from "./errors";

type ReactionHandlers = {
  [key in MetabotReaction["type"]]: ReactionHandler<
    Extract<MetabotReaction, { type: key }>
  >;
};

export const reactionHandlers: ReactionHandlers = {
  "metabot.reaction/message": showMessage,
  "metabot.reaction/redirect": redirect,
};
