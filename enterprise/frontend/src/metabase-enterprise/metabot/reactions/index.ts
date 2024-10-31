import type { MetabotReaction } from "metabase-types/api";

import { showMessage } from "./messages";
import type { ReactionHandler } from "./types";
import {
  changeDisplayType,
  changeTableVisualizationSettings,
} from "./visualizations";

export * from "./errors";

type ReactionHandlers = {
  [key in MetabotReaction["type"]]: ReactionHandler<
    Extract<MetabotReaction, { type: key }>
  >;
};

export const reactionHandlers: ReactionHandlers = {
  "metabot.reaction/message": showMessage,
  "metabot.reaction/change-table-visualization-settings":
    changeTableVisualizationSettings,
  "metabot.reaction/change-display-type": changeDisplayType,
};
