import { useMemo } from "react";

import {
  type ComputedVisualizationSettings,
  type GoalRefError,
  getGoalErrors,
  needsGraphGoalResolution,
} from "metabase/viz-core";
import type { Card, DatasetData } from "metabase-types/api";

import {
  type ResolvedGoalData,
  useResolvedGoalData,
} from "./use-resolved-goal-data";

/**
 * Resolves `graph.goal_value` to a number so the chart model only ever sees
 * numbers. A goal that can't resolve falls back to 0 and is reported in
 * `errors`. Returns the given settings untouched when there is nothing to resolve.
 */
export function useResolvedGoalSettings(
  card: Pick<Card, "display" | "dataset_query">,
  data: DatasetData,
  settings: ComputedVisualizationSettings,
): {
  status: ResolvedGoalData["status"];
  settings: ComputedVisualizationSettings;
  errors: GoalRefError[];
} {
  const needsResolving = needsGraphGoalResolution(card.display, settings);
  const goal = needsResolving ? (settings["graph.goal_value"] ?? null) : null;

  const goalData = useResolvedGoalData(card.dataset_query, data, [goal]);
  const results = goalData.status === "resolved" ? goalData.results : [];
  const errors = getGoalErrors(results);
  const value = errors.length > 0 ? 0 : (results[0]?.value ?? null);

  const resolvedSettings = useMemo(
    () =>
      needsResolving ? { ...settings, "graph.goal_value": value } : settings,
    [settings, needsResolving, value],
  );

  return { status: goalData.status, settings: resolvedSettings, errors };
}
