import type { DatasetData, DatasetQuery, GoalValue } from "metabase-types/api";

import type { GoalResolution } from "./use-answered-goal-data";
import { useAnsweredGoalValue } from "./use-answered-goal-value";

export type GoalValueResolution = GoalResolution<{ value: number | null }>;

export function useResolvedGoalValue(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  value: GoalValue | null | undefined,
): GoalValueResolution {
  const resolved = useAnsweredGoalValue({ data, datasetQuery, value });

  if (resolved.isUnanswered === true) {
    return { status: "resolving" };
  }

  if (resolved.error != null) {
    return { status: "failed" };
  }

  return { status: "resolved", value: resolved.value };
}
