import {
  type GoalRefError,
  resolveGoalValue,
} from "metabase/visualizations/lib/dynamic-goals";
import { segmentIsValid } from "metabase/visualizations/lib/utils";
import type { DatasetData } from "metabase-types/api";
import {
  isGoalValue,
  isObject,
  isResolvedGoalSegment,
} from "metabase-types/guards";

type ResolvedGaugeSegments = {
  segments: ResolvedGoalSegment[];
  errors: GoalRefError[];
};

type ResolvedGoalSegment = {
  color?: string;
  label?: string;
  min: number | null;
  max: number | null;
};

// Resolves the possibly dynamic min/max of every gauge segment to concrete numbers
export const resolveGaugeSegments = (
  rawSegments: unknown, // TODO: unknown
  data: DatasetData,
): ResolvedGaugeSegments => {
  if (!Array.isArray(rawSegments)) {
    return { segments: [], errors: [] };
  }

  const errors: GoalRefError[] = [];
  const resolvedSegments: ResolvedGoalSegment[] = [];

  for (const segment of rawSegments) {
    if (!isObject(segment)) {
      continue;
    }

    const min = resolveGoalValue(
      isGoalValue(segment.min) ? segment.min : null,
      data,
    );
    const max = resolveGoalValue(
      isGoalValue(segment.max) ? segment.max : null,
      data,
    );

    if (min.error) {
      errors.push(min.error);
    }

    if (max.error) {
      errors.push(max.error);
    }

    resolvedSegments.push({
      color: typeof segment.color === "string" ? segment.color : undefined,
      label: typeof segment.label === "string" ? segment.label : undefined,
      min: min.value,
      max: max.value,
    });
  }

  const segments = resolvedSegments.filter(
    (segment): segment is ResolvedGoalSegment => {
      return isResolvedGoalSegment(segment) && segmentIsValid(segment);
    },
  );

  return { segments, errors };
};

export const getValue = (rows: unknown[][]) => {
  const rawValue = rows[0] && rows[0][0];

  if (rawValue === "Infinity") {
    return Infinity;
  }

  if (typeof rawValue !== "number") {
    return 0;
  }

  return rawValue;
};

export const radians = (degrees: number) => (degrees * Math.PI) / 180;

export const degrees = (radians: number) => (radians * 180) / Math.PI;
