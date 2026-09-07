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

import {
  type GoalResolution,
  useAnsweredGoalData,
} from "./use-answered-goal-data";

export type GoalSegmentsResolution = GoalResolution<{
  segments: ResolvedGoalSegment[];
}>;

export function useResolvedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalSegmentsResolution {
  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    getUnansweredGoalEntities(data, segments),
  );

  if (answered.status !== "resolved") {
    return answered;
  }

  return getGoalSegmentsResolution(answered.data, segments);
}

// No further fetch happens past this point, so an unanswered reference counts as failed.
function getGoalSegmentsResolution(
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalSegmentsResolution {
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
