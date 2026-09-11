import { useMemo } from "react";

import type {
  ComputedVisualizationSettings,
  GoalValueResult,
} from "metabase/viz-core";
import { needsGraphGoalResolution } from "metabase/viz-core";
import type { Card, DatasetData } from "metabase-types/api";

import type { GoalResolutionStatus } from "./use-answered-goal-data";
import { useAnsweredGoalValue } from "./use-answered-goal-value";

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

  const goal = useAnsweredGoalValue({
    data,
    datasetQuery: card.dataset_query,
    value: needsResolving ? settings["graph.goal_value"] : null,
  });

  const resolvedSettings = useMemo(
    () =>
      needsResolving
        ? { ...settings, "graph.goal_value": goal.value }
        : settings,
    [settings, needsResolving, goal.value],
  );

  return { status: getGoalResolutionStatus(goal), settings: resolvedSettings };
}

function getGoalResolutionStatus({
  isUnanswered,
  error,
}: GoalValueResult): GoalResolutionStatus {
  if (isUnanswered === true) {
    return "resolving";
  }

  if (error !== undefined) {
    return "failed";
  }

  return "resolved";
}
