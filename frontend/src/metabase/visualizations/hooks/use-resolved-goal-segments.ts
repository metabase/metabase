import {
  type ResolvedGoalSegment,
  getGoalSegmentBounds,
  resolveGoalSegments,
} from "metabase/viz-core";
import type {
  DatasetData,
  DatasetQuery,
  GoalSegment,
} from "metabase-types/api";

import type { GoalResolution } from "./use-answered-goal-data";
import { useAnsweredGoalDataForValues } from "./use-answered-goal-data-for-values";

export type GoalSegmentsResolution = GoalResolution<{
  segments: ResolvedGoalSegment[];
}>;

export function useResolvedGoalSegments(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  segments: GoalSegment[] | undefined,
): GoalSegmentsResolution {
  const answered = useAnsweredGoalDataForValues(
    datasetQuery,
    data,
    getGoalSegmentBounds(segments),
  );

  if (answered.status !== "resolved") {
    return answered;
  }

  return {
    status: "resolved",
    segments: resolveGoalSegments(answered.data, segments),
  };
}
