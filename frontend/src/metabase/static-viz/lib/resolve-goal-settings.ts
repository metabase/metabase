import type { ComputedVisualizationSettings } from "metabase/viz-core";
import {
  getUnresolvedGoalMessage,
  hasUnresolvedGoalValues,
  needsGraphGoalResolution,
  resolveGoalValue,
} from "metabase/viz-core";
import type { SingleSeries } from "metabase-types/api";

export function resolveGoalSettings(
  { card, data }: SingleSeries,
  settings: ComputedVisualizationSettings,
): ComputedVisualizationSettings {
  if (!needsGraphGoalResolution(card.display, settings)) {
    return settings;
  }

  const goal = settings["graph.goal_value"];

  if (hasUnresolvedGoalValues(data, [goal])) {
    throw new Error(getUnresolvedGoalMessage("value"));
  }

  return {
    ...settings,
    "graph.goal_value": resolveGoalValue(data, goal).value,
  };
}
