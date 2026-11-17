import { useMemo } from "react";

import type { DatasetData, ReferencedEntity } from "metabase-types/api";

import { useReferencedEntitiesQuery } from "./use-referenced-entities-query";

export type GoalResolution<T> =
  | { status: "resolving" }
  | { status: "failed" }
  | ({ status: "resolved" } & T);

export type GoalResolutionStatus = GoalResolution<unknown>["status"];

export type GoalDataResolution = GoalResolution<{ data: DatasetData }>;

/**
 * Answers the given goal references the dataset can't by fetching their goal
 * values, then merges the fresh answers into `data.referenced_entities`.
 */
export function useAnsweredGoalData(
  data: DatasetData,
  unansweredEntities: ReferencedEntity[],
): GoalDataResolution {
  const { currentData: goalValues, isError } =
    useReferencedEntitiesQuery(unansweredEntities);

  const answeredData = useMemo(() => {
    if (goalValues === undefined) {
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
