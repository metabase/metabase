import {
  getUnansweredGoalEntities,
  hasUnresolvedGoalValues,
} from "metabase/viz-core";
import type { DatasetData, DatasetQuery, GoalValue } from "metabase-types/api";

import {
  type GoalDataResolution,
  useAnsweredGoalData,
} from "./use-answered-goal-data";

/**
 * Answers the references in `goalValues` and fails if any of them can't
 * resolve, so the returned data resolves every one of them.
 */
export function useResolvedGoalData(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  goalValues: (GoalValue | null)[],
): GoalDataResolution {
  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    getUnansweredGoalEntities(data, goalValues),
  );

  if (
    answered.status === "resolved" &&
    hasUnresolvedGoalValues(answered.data, goalValues)
  ) {
    return { status: "failed" };
  }

  return answered;
}
