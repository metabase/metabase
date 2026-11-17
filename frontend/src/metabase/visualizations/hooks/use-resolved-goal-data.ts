import {
  type GoalValueResult,
  getUnansweredGoalEntities,
} from "metabase/viz-core";
import type { DatasetData, GoalValue } from "metabase-types/api";

import { useAnsweredGoalData } from "./use-answered-goal-data";
import { getAnsweredGoalValue } from "./use-answered-goal-value";

export type ResolvedGoalData =
  | { status: "resolving" }
  | {
      status: "resolved";
      data: DatasetData;
      results: GoalValueResult[];
    };

/**
 * Answers the references in `goalValues` the dataset can't, then resolves
 * every goal value against the answered data.
 */
export function useResolvedGoalData(
  data: DatasetData,
  goalValues: (GoalValue | null)[],
): ResolvedGoalData {
  const answered = useAnsweredGoalData(
    data,
    getUnansweredGoalEntities(data, goalValues),
  );

  if (answered.status === "resolving") {
    return { status: "resolving" };
  }

  return {
    status: "resolved",
    data: answered.status === "resolved" ? answered.data : data,
    results: goalValues.map((value) => {
      return getAnsweredGoalValue(data, answered, value);
    }),
  };
}
