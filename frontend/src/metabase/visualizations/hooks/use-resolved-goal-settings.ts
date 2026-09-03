import { useMemo } from "react";

import { isDynamicGoalSetting } from "metabase/visualizations/lib/dynamic-goals";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { Card, DatasetData } from "metabase-types/api";
import { isGoalStaticValue } from "metabase-types/guards";

import { useResolvedGoal } from "./use-resolved-goal";

export type ResolvedGoalSettings =
  | { status: "resolving" }
  | { status: "failed" }
  | { status: "resolved"; settings: ComputedVisualizationSettings };

/**
 * Resolves `graph.goal_value` to a number so the chart model only ever sees
 * numbers. Returns the given settings untouched when there is nothing to resolve.
 */
export function useResolvedGoalSettings(
  card: Pick<Card, "display" | "dataset_query">,
  data: DatasetData,
  settings: ComputedVisualizationSettings,
): ResolvedGoalSettings {
  const storedGoal = settings["graph.goal_value"];
  const needsResolving =
    storedGoal != null &&
    !isGoalStaticValue(storedGoal) &&
    isDynamicGoalSetting(card.display, "graph.goal_value");

  const goal = useResolvedGoal(
    card.dataset_query,
    data,
    needsResolving ? storedGoal : null,
  );
  const goalValue = goal.status === "resolved" ? goal.value : null;

  const resolvedSettings = useMemo(
    () =>
      needsResolving
        ? { ...settings, "graph.goal_value": goalValue }
        : settings,
    [settings, needsResolving, goalValue],
  );

  if (needsResolving && goal.status !== "resolved") {
    return goal;
  }

  return { status: "resolved", settings: resolvedSettings };
}
