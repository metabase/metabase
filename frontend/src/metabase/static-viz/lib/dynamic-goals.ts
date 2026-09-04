import type { ComputedVisualizationSettings } from "metabase/viz-core";
import {
  getUnansweredGoalEntitiesForValues,
  hasFailedGoalReferencesForValues,
  isDynamicGoalSetting,
  resolveGoalValue,
} from "metabase/viz-core";
import type { SingleSeries } from "metabase-types/api";
import { isGoalStaticValue } from "metabase-types/guards";

// Static rendering can't fetch, so a goal the data doesn't answer is an error.
export function resolveGoalSettingsForStaticViz(
  { card, data }: SingleSeries,
  settings: ComputedVisualizationSettings,
): ComputedVisualizationSettings {
  const goal = settings["graph.goal_value"];

  if (
    goal == null ||
    isGoalStaticValue(goal) ||
    !isDynamicGoalSetting(card.display, "graph.goal_value")
  ) {
    return settings;
  }

  if (
    getUnansweredGoalEntitiesForValues(data, [goal]).length > 0 ||
    hasFailedGoalReferencesForValues(data, [goal])
  ) {
    throw new Error("Couldn't resolve this chart's goal line");
  }

  return {
    ...settings,
    "graph.goal_value": resolveGoalValue(data, goal).value,
  };
}
