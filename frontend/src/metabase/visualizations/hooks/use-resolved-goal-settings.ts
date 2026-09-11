import { useMemo } from "react";

import type { ComputedVisualizationSettings } from "metabase/viz-core";
import { needsGraphGoalResolution, resolveGoalValue } from "metabase/viz-core";
import type { Card, DatasetData } from "metabase-types/api";

import type { GoalResolutionStatus } from "./use-answered-goal-data";
import { useResolvedGoalData } from "./use-resolved-goal-data";

/**
 * Resolves `graph.goal_value` to a number so the chart model only ever sees
 * numbers. Returns the given settings untouched when there is nothing to resolve.
 */
export function useResolvedGoalSettings(
  card: Pick<Card, "display" | "dataset_query">,
  data: DatasetData,
  settings: ComputedVisualizationSettings,
): { status: GoalResolutionStatus; settings: ComputedVisualizationSettings } {
  const needsResolving = needsGraphGoalResolution(card.display, settings);
  const goal = needsResolving ? (settings["graph.goal_value"] ?? null) : null;

  const goalData = useResolvedGoalData(card.dataset_query, data, [goal]);
  const value =
    goalData.status === "resolved"
      ? resolveGoalValue(goalData.data, goal).value
      : null;

  const resolvedSettings = useMemo(
    () =>
      needsResolving ? { ...settings, "graph.goal_value": value } : settings,
    [settings, needsResolving, value],
  );

  return { status: goalData.status, settings: resolvedSettings };
}
