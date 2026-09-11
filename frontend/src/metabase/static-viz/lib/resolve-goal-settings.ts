import type { ComputedVisualizationSettings } from "metabase/viz-core";
import {
  getUnresolvedGoalMessage,
  hasUnresolvedGoalValues,
  needsGraphGoalResolution,
  resolveGraphGoalSettings,
} from "metabase/viz-core";
import type { SingleSeries } from "metabase-types/api";

export function resolveGoalSettings(
  { card, data }: SingleSeries,
  settings: ComputedVisualizationSettings,
): ComputedVisualizationSettings {
  if (
    needsGraphGoalResolution(card.display, settings) &&
    hasUnresolvedGoalValues(data, [settings["graph.goal_value"]])
  ) {
    throw new Error(getUnresolvedGoalMessage("value"));
  }

  return resolveGraphGoalSettings(card.display, settings, data);
}
