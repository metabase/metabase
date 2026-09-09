import {
  type ResolvedGoalSegment,
  type ResolvedOpenEndedGoalSegment,
  getGoalSegmentBounds,
  getUnansweredGoalEntities,
  hasUnresolvedGoalValues,
  resolveGoalSegments,
  resolveOpenEndedGoalSegments,
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

type GoalSegmentsResolution<TSegment> = GoalResolution<{
  segments: TSegment[];
}>;

export function useResolvedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalSegmentsResolution<ResolvedGoalSegment> {
  return useResolvedGoalSegmentsWith(
    datasetQuery,
    data,
    segments,
    resolveGoalSegments,
  );
}

export function useResolvedOpenEndedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalSegmentsResolution<ResolvedOpenEndedGoalSegment> {
  return useResolvedGoalSegmentsWith(
    datasetQuery,
    data,
    segments,
    resolveOpenEndedGoalSegments,
  );
}

function useResolvedGoalSegmentsWith<TSegment>(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
  resolve: (
    data: DatasetData,
    segments: GoalSegment[] | undefined,
  ) => TSegment[],
): GoalSegmentsResolution<TSegment> {
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

  return { status: "resolved", segments: resolve(answered.data, segments) };
}
