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

export function useResolvedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalResolution<{ segments: ResolvedGoalSegment[] }> {
  const bounds = getGoalSegmentBounds(segments);
  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    getUnansweredGoalEntities(data, bounds),
  );

  if (answered.status !== "resolved") {
    return answered;
  }

  if (hasUnresolvedGoalValues(answered.data, bounds)) {
    return { status: "failed" };
  }

  return {
    status: "resolved",
    segments: resolveGoalSegments(answered.data, segments),
  };
}
