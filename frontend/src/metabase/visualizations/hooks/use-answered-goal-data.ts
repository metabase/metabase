import { useMemo } from "react";

import type {
  DatasetData,
  DatasetQuery,
  ReferencedEntity,
} from "metabase-types/api";

import { useReferencedEntitiesQuery } from "./use-referenced-entities-query";

export type AnsweredGoalData =
  | { status: "resolving" }
  | { status: "failed" }
  | { status: "answered"; data: DatasetData };

/**
 * Answers the given goal references the dataset can't by re-running the
 * question's query with them attached, then merges the fresh answers into
 * `data.referenced_entities`.
 */
export function useAnsweredGoalData(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  unansweredEntities: ReferencedEntity[],
): AnsweredGoalData {
  const { currentData: freshDataset, isError } = useReferencedEntitiesQuery(
    datasetQuery,
    unansweredEntities,
  );

  const answeredData = useMemo(() => {
    const freshData = freshDataset?.data;

    if (freshData?.referenced_entities == null) {
      return null;
    }

    return {
      ...data,
      referenced_entities: {
        card: {
          ...data.referenced_entities?.card,
          ...freshData.referenced_entities.card,
        },
        measure: {
          ...data.referenced_entities?.measure,
          ...freshData.referenced_entities.measure,
        },
      },
    };
  }, [data, freshDataset]);

  if (unansweredEntities.length === 0) {
    return { status: "answered", data };
  }

  if (isError || freshDataset?.error != null) {
    return { status: "failed" };
  }

  if (freshDataset?.data == null) {
    return { status: "resolving" };
  }

  // completed, but the response has no answer
  if (answeredData == null) {
    return { status: "failed" };
  }

  return { status: "answered", data: answeredData };
}
