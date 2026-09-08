import {
  getUnansweredGoalEntities,
  hasUnresolvedGoalReferences,
} from "metabase/viz-core";
import type { DatasetData, DatasetQuery, GoalValue } from "metabase-types/api";

import {
  type GoalDataResolution,
  useAnsweredGoalData,
} from "./use-answered-goal-data";

/**
 * Like `useAnsweredGoalData`, for the references among `values`. Resolves only
 * once every one of them is answered without error.
 */
export function useAnsweredGoalDataForValues(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  values: ReadonlyArray<GoalValue | null | undefined>,
): GoalDataResolution {
  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    getUnansweredGoalEntities(data, values),
  );

  if (answered.status !== "resolved") {
    return answered;
  }

  // No further fetch happens past this point, so an unanswered reference counts as failed.
  if (hasUnresolvedGoalReferences(answered.data, values)) {
    return { status: "failed" };
  }

  return answered;
}
