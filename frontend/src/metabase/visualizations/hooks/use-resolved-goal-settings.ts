import { useMemo } from "react";

import type { ComputedVisualizationSettings } from "metabase/viz-core";
import { needsGraphGoalResolution } from "metabase/viz-core";
import type { Card, DatasetData } from "metabase-types/api";

import type { GoalResolutionStatus } from "./use-answered-goal-data";
import { useResolvedGoalValue } from "./use-resolved-goal-value";

/**
 * Resolves `graph.goal_value` to a number so the chart model only ever sees
 * numbers. Returns the given settings untouched when there is nothing to resolve.
 * The settings are present in every status: the chart model is built while the
 * goal still resolves, with `graph.goal_value` null until it does.
 */
export function useResolvedGoalSettings(
  card: Pick<Card, "display" | "dataset_query">,
  data: DatasetData,
  settings: ComputedVisualizationSettings,
): { status: GoalResolutionStatus; settings: ComputedVisualizationSettings } {
  const needsResolving = needsGraphGoalResolution(card.display, settings);

  const goal = useResolvedGoalValue(
    card.dataset_query,
    data,
    needsResolving ? settings["graph.goal_value"] : null,
  );
  const goalValue = goal.status === "resolved" ? goal.value : null;

  const resolvedSettings = useMemo(
    () =>
      needsResolving
        ? { ...settings, "graph.goal_value": goalValue }
        : settings,
    [settings, needsResolving, goalValue],
  );

  return { status: goal.status, settings: resolvedSettings };
}
