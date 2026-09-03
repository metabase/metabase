import {
  type ResolvedGoalSegment,
  type ResolvedOpenEndedGoalSegment,
  getUnansweredGoalEntities,
  hasFailedGoalReferences,
  resolveGoalSegments,
  resolveOpenEndedGoalSegments,
} from "metabase/visualizations/lib/dynamic-goals";
import type {
  DatasetData,
  DatasetQuery,
  GoalSegment,
} from "metabase-types/api";

import { useAnsweredGoalData } from "./use-answered-goal-data";

type GoalSegmentsResolution<TSegment> =
  | { status: "resolving" }
  | { status: "failed" }
  | { status: "resolved"; segments: TSegment[] };

export type GoalSegmentsState = GoalSegmentsResolution<ResolvedGoalSegment>;

export type OpenEndedGoalSegmentsState =
  GoalSegmentsResolution<ResolvedOpenEndedGoalSegment>;

export function useResolvedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalSegmentsState {
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
): OpenEndedGoalSegmentsState {
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
  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    getUnansweredGoalEntities(data, segments),
  );

  if (answered.status !== "answered") {
    return answered;
  }

  // No further fetch happens past this point, so an unanswered reference counts as failed.
  if (
    getUnansweredGoalEntities(answered.data, segments).length > 0 ||
    hasFailedGoalReferences(answered.data, segments)
  ) {
    return { status: "failed" };
  }

  return { status: "resolved", segments: resolve(answered.data, segments) };
}
