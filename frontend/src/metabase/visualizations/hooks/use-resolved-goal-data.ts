import {
  type GoalData,
  type GoalValueResult,
  getUnansweredGoalEntities,
} from "metabase/viz-core";
import type { GoalValue } from "metabase-types/api";

import { useAnsweredGoalData } from "./use-answered-goal-data";
import { getAnsweredGoalValue } from "./use-answered-goal-value";

export type ResolvedGoalData =
  | { status: "resolving" }
  | {
      status: "resolved";
      data: GoalData;
      results: GoalValueResult[];
    };

/**
 * Fetches the values of the goal sources `goalValues` reference, then resolves
 * every goal value against `data` and those values.
 */
export function useResolvedGoalData(
  data: GoalData,
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
