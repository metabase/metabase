import {
  type GoalValues,
  getUnansweredGoalEntitiesForValues,
  hasUnresolvedGoalValues,
} from "metabase/viz-core";
import type { DatasetData, DatasetQuery } from "metabase-types/api";

import {
  type GoalDataResolution,
  useAnsweredGoalData,
} from "./use-answered-goal-data";

/**
 * Like `useAnsweredGoalData`, for the references among `values`. Resolves only
 * once every one of them is answered without error.
 */
export function useAnsweredGoalValues(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  values: GoalValues,
): GoalDataResolution {
  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    getUnansweredGoalEntitiesForValues(data, values),
  );

  if (answered.status !== "resolved") {
    return answered;
  }

  // No further fetch happens past this point, so an unanswered reference counts as failed.
  if (hasUnresolvedGoalValues(answered.data, values)) {
    return { status: "failed" };
  }

  return answered;
}
