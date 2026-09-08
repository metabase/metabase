import {
  type ResolvedGoalSegment,
  getGoalSegmentBounds,
  getUnansweredGoalEntities,
  hasUnresolvedGoalValues,
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
  const bounds = getGoalSegmentBounds(segments);
  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    getUnansweredGoalEntities(data, bounds),
  );

  if (answered.status !== "resolved") {
    return answered;
  }

  // No further fetch happens past this point, so an unanswered bound counts as failed.
  if (hasUnresolvedGoalValues(answered.data, bounds)) {
    return { status: "failed" };
  }

  return {
    status: "resolved",
    segments: resolveGoalSegments(answered.data, segments),
  };
}
