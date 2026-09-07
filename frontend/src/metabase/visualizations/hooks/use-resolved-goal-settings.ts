import { useMemo } from "react";

import type { ComputedVisualizationSettings } from "metabase/viz-core";
import { isGraphGoalReference } from "metabase/viz-core";
import type { Card, DatasetData } from "metabase-types/api";

import type { GoalResolutionStatus } from "./use-answered-goal-data";
import { useResolvedGoal } from "./use-resolved-goal";

export type GoalSettingsResolution = {
  status: GoalResolutionStatus;
  // `graph.goal_value` is a number, or null until resolved
  settings: ComputedVisualizationSettings;
};

/**
 * Resolves `graph.goal_value` to a number so the chart model only ever sees
 * numbers. Returns the given settings untouched when there is nothing to resolve.
 */
export function useResolvedGoalSettings(
  card: Pick<Card, "display" | "dataset_query">,
  data: DatasetData,
  settings: ComputedVisualizationSettings,
): GoalSettingsResolution {
  const needsResolving = isGraphGoalReference(card.display, settings);

  const goal = useResolvedGoal(
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

  return {
    status: needsResolving ? goal.status : "resolved",
    settings: resolvedSettings,
  };
}
