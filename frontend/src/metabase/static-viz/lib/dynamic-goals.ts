import type { ComputedVisualizationSettings } from "metabase/viz-core";
import {
  getUnansweredGoalEntitiesForValues,
  getUnresolvedGoalMessage,
  hasFailedGoalReferencesForValues,
  isGraphGoalReference,
  resolveGoalValue,
} from "metabase/viz-core";
import type { SingleSeries } from "metabase-types/api";

// Static rendering can't fetch, so a goal the data doesn't answer is an error.
export function resolveGoalSettingsForStaticViz(
  { card, data }: SingleSeries,
  settings: ComputedVisualizationSettings,
): ComputedVisualizationSettings {
  const goal = settings["graph.goal_value"];

  if (!isGraphGoalReference(card.display, goal)) {
    return settings;
  }

  if (
    getUnansweredGoalEntitiesForValues(data, [goal]).length > 0 ||
    hasFailedGoalReferencesForValues(data, [goal])
  ) {
    throw new Error(getUnresolvedGoalMessage());
  }

  return {
    ...settings,
    "graph.goal_value": resolveGoalValue(data, goal).value,
  };
}
