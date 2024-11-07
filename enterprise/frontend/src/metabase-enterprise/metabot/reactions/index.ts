import type { MetabotReaction } from "metabase-types/api";

import { apiCall } from "./api";
import { requireUserConfirmation, showMessage } from "./messages";
import { writeBack } from "./metabot";
import { changeQuery } from "./queries";
import type { ReactionHandler } from "./types";
import {
  changeAxesLabels,
  changeColumnSettings,
  changeDisplayType,
  changeGoalLine,
  changeSeriesSettings,
  changeStackingSettings,
  changeTableVisualizationSettings,
  changeYAxisRange,
} from "./visualizations";

export * from "./errors";

type ReactionHandlers = {
  [key in MetabotReaction["type"]]: ReactionHandler<
    Extract<MetabotReaction, { type: key }>
  >;
};

export const reactionHandlers: ReactionHandlers = {
  "metabot.reaction/change-goal-line": changeGoalLine,
  "metabot.reaction/change-stacking-settings": changeStackingSettings,
  "metabot.reaction/change-column-settings": changeColumnSettings,
  "metabot.reaction/change-series-settings": changeSeriesSettings,
  "metabot.reaction/change-axes-labels": changeAxesLabels,
  "metabot.reaction/change-display-type": changeDisplayType,
  "metabot.reaction/change-table-visualization-settings":
    changeTableVisualizationSettings,
  "metabot.reaction/confirmation": requireUserConfirmation,
  "metabot.reaction/message": showMessage,
  "metabot.reaction/api-call": apiCall,
  "metabot.reaction/writeback": writeBack,
  "metabot.reaction/change-query": changeQuery,
  "metabot.reaction/change-y-axis-range": changeYAxisRange,
};
