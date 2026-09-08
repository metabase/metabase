import type { DatasetData, DatasetQuery, GoalValue } from "metabase-types/api";

import type { GoalResolution } from "./use-answered-goal-data";
import { useResolvedGoalValue } from "./use-resolved-goal-value";

export type GoalValueResolution = GoalResolution<{ value: number | null }>;

// The chart-side view of `useResolvedGoalValue`: only whether the value is usable yet.
export function useGoalValueResolution(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  value: GoalValue | null | undefined,
): GoalValueResolution {
  const resolved = useResolvedGoalValue(datasetQuery, data, value);

  if (resolved.isUnanswered) {
    return { status: "resolving" };
  }

  if (resolved.error != null) {
    return { status: "failed" };
  }

  return { status: "resolved", value: resolved.value };
}
