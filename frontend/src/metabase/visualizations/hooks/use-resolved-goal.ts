import {
  getUnansweredGoalEntitiesForValues,
  hasFailedGoalReferencesForValues,
  resolveGoalValue,
} from "metabase/viz-core";
import type { DatasetData, DatasetQuery, GoalValue } from "metabase-types/api";

import { useAnsweredGoalData } from "./use-answered-goal-data";

export type GoalState =
  | { status: "resolving" }
  | { status: "failed" }
  | { status: "resolved"; value: number | null };

export function useResolvedGoal(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  value: GoalValue | null | undefined,
): GoalState {
  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    getUnansweredGoalEntitiesForValues(data, [value]),
  );

  if (answered.status !== "answered") {
    return answered;
  }

  // No further fetch happens past this point, so an unanswered reference counts as failed.
  if (
    getUnansweredGoalEntitiesForValues(answered.data, [value]).length > 0 ||
    hasFailedGoalReferencesForValues(answered.data, [value])
  ) {
    return { status: "failed" };
  }

  return {
    status: "resolved",
    value: resolveGoalValue(answered.data, value).value,
  };
}
