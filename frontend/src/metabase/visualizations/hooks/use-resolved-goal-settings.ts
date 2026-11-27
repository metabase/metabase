import { useMemo } from "react";

import {
  type ComputedVisualizationSettings,
  type GoalRefError,
  applyGraphGoalValue,
  getGoalErrors,
  needsGraphGoalResolution,
} from "metabase/viz-core";
import type { Card, DatasetData } from "metabase-types/api";

import {
  type ResolvedGoalValues,
  useResolvedGoalValues,
} from "./use-resolved-goal-values";

/**
 * Resolves `graph.goal_value` to a number for the chart model. A goal that
 * can't resolve turns off `graph.show_goal` and is reported in `errors`.
 * Returns the given settings untouched when there is nothing to resolve.
 */
export function useResolvedGoalSettings(
  card: Pick<Card, "display">,
  data: DatasetData,
  settings: ComputedVisualizationSettings,
): {
  status: ResolvedGoalValues["status"];
  settings: ComputedVisualizationSettings;
  errors: GoalRefError[];
} {
  const needsResolving = needsGraphGoalResolution(card.display, settings);
  const goal = needsResolving ? (settings["graph.goal_value"] ?? null) : null;

  const resolvedGoal = useResolvedGoalValues(data, [goal]);
  const results =
    resolvedGoal.status === "resolved" ? resolvedGoal.results : [];
  const errors = getGoalErrors(results);
  const value = results[0]?.value ?? null;

  const resolvedSettings = useMemo(
    () => (needsResolving ? applyGraphGoalValue(settings, value) : settings),
    [settings, needsResolving, value],
  );

  return { status: resolvedGoal.status, settings: resolvedSettings, errors };
}
