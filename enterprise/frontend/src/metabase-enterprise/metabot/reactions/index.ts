import type { MetabotReaction } from "metabase-types/api";

import { apiCall } from "./api";
import { requireUserConfirmation, showMessage } from "./messages";
import { writeBack } from "./metabot";
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
  "metabot.reaction/change-display-type": changeDisplayType,
  "metabot.reaction/change-table-visualization-settings":
    changeTableVisualizationSettings,
  "metabot.reaction/confirmation": requireUserConfirmation,
  "metabot.reaction/message": showMessage,
  "metabot.reaction/api-call": apiCall,
  "metabot.reaction/writeback": writeBack,
};
