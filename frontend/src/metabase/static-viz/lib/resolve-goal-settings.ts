import type { ComputedVisualizationSettings } from "metabase/viz-core";
import {
  applyGraphGoalValue,
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

  const resolved = resolveGoalValue(data, settings["graph.goal_value"]);

  return applyGraphGoalValue(settings, resolved.value);
}
