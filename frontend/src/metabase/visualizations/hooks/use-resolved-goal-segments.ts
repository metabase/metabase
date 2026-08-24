import { useMemo } from "react";

import { useReferencedEntitiesQuery } from "metabase/visualizations/hooks/use-referenced-entities-query";
import {
  type ResolvedGoalSegment,
  getGoalSegmentErrors,
  getUnansweredGoalEntities,
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
    return {
      status: "resolved",
      segments: resolveGoalSegments(data, segments),
    };
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

  const stillUnanswered = getUnansweredGoalEntities(answeredData, segments);

  if (
    stillUnanswered.length > 0 ||
    getGoalSegmentErrors(answeredData, segments).length > 0
  ) {
    return { status: "failed" };
  }

  return {
    status: "resolved",
    segments: resolveGoalSegments(answeredData, segments),
  };
}
