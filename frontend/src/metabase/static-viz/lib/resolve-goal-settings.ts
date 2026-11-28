import type { ComputedVisualizationSettings } from "metabase/viz-core";
import {
  applyGraphGoalValue,
  needsGraphGoalResolution,
  resolveGoalValue,
} from "metabase/viz-core";
import type { GoalSourceResults, SingleSeries } from "metabase-types/api";

// the backend resolves goals that read other entities before it renders a chart
export const STATIC_VIZ_GOAL_SOURCE_RESULTS: GoalSourceResults = {};

export function resolveGoalSettings(
  { card, data }: SingleSeries,
  settings: ComputedVisualizationSettings,
): ComputedVisualizationSettings {
  if (!needsGraphGoalResolution(card.display, settings)) {
    return settings;
  }

  const resolved = resolveGoalValue(
    data,
    STATIC_VIZ_GOAL_SOURCE_RESULTS,
    settings["graph.goal_value"],
  );

  return applyGraphGoalValue(settings, resolved.value);
}
