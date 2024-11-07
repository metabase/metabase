import type { MetabotReaction } from "metabase-types/api";

import { apiCall } from "./api";
import { requireUserConfirmation, showMessage } from "./messages";
import { writeBack } from "./metabot";
import {
  aggregateQuery,
  booleanFilterQuery,
  breakoutQuery,
  limitQuery,
  numberFilterQuery,
  relativeDateFilterQuery,
  sortQuery,
  stringFilterQuery,
} from "./queries";
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
  "metabot.reaction/string-filter-query": stringFilterQuery,
  "metabot.reaction/number-filter-query": numberFilterQuery,
  "metabot.reaction/boolean-filter-query": booleanFilterQuery,
  "metabot.reaction/relative-date-filter-query": relativeDateFilterQuery,
  "metabot.reaction/aggregate-query": aggregateQuery,
  "metabot.reaction/breakout-query": breakoutQuery,
  "metabot.reaction/sort-query": sortQuery,
  "metabot.reaction/limit-query": limitQuery,
};
