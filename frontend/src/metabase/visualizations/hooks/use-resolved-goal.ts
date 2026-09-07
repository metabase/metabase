import { resolveGoalValue } from "metabase/viz-core";
import type { DatasetData, DatasetQuery, GoalValue } from "metabase-types/api";

import type { GoalResolution } from "./use-answered-goal-data";
import { useAnsweredGoalValues } from "./use-answered-goal-values";

export type GoalValueResolution = GoalResolution<{ value: number | null }>;

export function useResolvedGoal(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  value: GoalValue | null | undefined,
): GoalValueResolution {
  const answered = useAnsweredGoalValues(datasetQuery, data, [value]);

  if (answered.status !== "resolved") {
    return answered;
  }

  return {
    status: "resolved",
    value: resolveGoalValue(answered.data, value).value,
  };
}
