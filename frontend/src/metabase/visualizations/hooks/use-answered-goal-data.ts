import { useMemo } from "react";

import type { GoalData } from "metabase/viz-core";
import type { ReferencedEntity } from "metabase-types/api";

import { useGoalValuesQuery } from "./use-goal-values-query";

export type GoalResolution<T> =
  | { status: "resolving" }
  | { status: "failed" }
  | ({ status: "resolved" } & T);

export type GoalResolutionStatus = GoalResolution<unknown>["status"];

export type GoalDataResolution = GoalResolution<{ data: GoalData }>;

/**
 * Fetches the values of the goal sources `data` has no answer for, and merges
 * them into `data.referenced_entities`.
 */
export function useAnsweredGoalData(
  data: GoalData,
  unansweredEntities: ReferencedEntity[],
): GoalDataResolution {
  const { currentData: goalValues, isError } =
    useGoalValuesQuery(unansweredEntities);

  const answeredData = useMemo(() => {
    if (goalValues == null) {
      return null;
    }

    return {
      ...data,
      referenced_entities: {
        card: { ...data.referenced_entities?.card, ...goalValues.card },
        measure: {
          ...data.referenced_entities?.measure,
          ...goalValues.measure,
        },
      },
    };
  }, [data, goalValues]);

  if (unansweredEntities.length === 0) {
    return { status: "resolved", data };
  }

  if (isError) {
    return { status: "failed" };
  }

  if (answeredData === null) {
    return { status: "resolving" };
  }

  return { status: "resolved", data: answeredData };
}
