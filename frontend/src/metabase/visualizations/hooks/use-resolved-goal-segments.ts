import {
  type ResolveGoalSegmentsOptions,
  type ResolvedGoalSegment,
  type ResolvedOpenEndedGoalSegment,
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

type Options = Pick<ResolveGoalSegmentsOptions, "allowOpenEnded">;

export function useResolvedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
  options: Options & { allowOpenEnded: true },
): GoalResolution<{ segments: ResolvedOpenEndedGoalSegment[] }>;
export function useResolvedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
  options?: Options & { allowOpenEnded?: false },
): GoalResolution<{ segments: ResolvedGoalSegment[] }>;
export function useResolvedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
  options: Options = {},
): GoalResolution<{ segments: ResolvedOpenEndedGoalSegment[] }> {
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
    segments: resolveGoalSegments(answered.data, segments, options),
  };
}
