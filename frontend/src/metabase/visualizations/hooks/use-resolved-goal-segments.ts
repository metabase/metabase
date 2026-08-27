import { useMemo } from "react";

import { useReferencedEntitiesQuery } from "metabase/visualizations/hooks/use-referenced-entities-query";
import {
  type ResolvedGoalSegment,
  getUnansweredGoalEntities,
  hasFailedGoalReferences,
  resolveGoalSegments,
} from "metabase/visualizations/lib/dynamic-goals";
import type {
  DatasetData,
  DatasetQuery,
  GoalSegment,
} from "metabase-types/api";

export type GoalSegmentsState =
  | { status: "resolving" }
  | { status: "failed" }
  | { status: "resolved"; segments: ResolvedGoalSegment[] };

export function useResolvedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalSegmentsState {
  const unansweredEntities = getUnansweredGoalEntities(data, segments);

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
    return getGoalSegmentsState(data, segments);
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

  return getGoalSegmentsState(answeredData, segments);
}

// No further fetch happens past this point, so an unanswered reference counts as failed.
function getGoalSegmentsState(
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalSegmentsState {
  if (
    getUnansweredGoalEntities(data, segments).length > 0 ||
    hasFailedGoalReferences(data, segments)
  ) {
    return { status: "failed" };
  }

  return {
    status: "resolved",
    segments: resolveGoalSegments(data, segments),
  };
}
