import {
  type ResolvedGoalSegment,
  getUnansweredGoalEntities,
  hasFailedGoalReferences,
  resolveGoalSegments,
} from "metabase/viz-core";
import type {
  DatasetData,
  DatasetQuery,
  GoalSegment,
} from "metabase-types/api";

import { useAnsweredGoalData } from "./use-answered-goal-data";

export type GoalSegmentsState =
  | { status: "resolving" }
  | { status: "failed" }
  | { status: "resolved"; segments: ResolvedGoalSegment[] };

export function useResolvedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalSegmentsState {
  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    getUnansweredGoalEntities(data, segments),
  );

  if (answered.status !== "answered") {
    return answered;
  }

  return getGoalSegmentsState(answered.data, segments);
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
