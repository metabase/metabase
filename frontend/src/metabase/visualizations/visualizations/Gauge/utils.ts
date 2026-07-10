import {
  type GoalRefError,
  resolveGoalValue,
} from "metabase/visualizations/lib/dynamic-goals";
import { segmentIsValid } from "metabase/visualizations/lib/utils";
import type { DatasetData, ResolvedGoalSegment } from "metabase-types/api";
import {
  isGoalValue,
  isObject,
  isResolvedGoalSegment,
} from "metabase-types/guards";

type ResolvedGoalSegments = {
  segments: ResolvedGoalSegment[];
  errors: GoalRefError[];
};

// Resolves the possibly dynamic min/max of every gauge segment to concrete numbers
export const resolveGoalSegments = (
  rawSegments: unknown, // TODO: unknown
  data: DatasetData,
): ResolvedGoalSegments => {
  if (!Array.isArray(rawSegments)) {
    return { segments: [], errors: [] };
  }

  const errors: GoalRefError[] = [];
  const segments: ResolvedGoalSegment[] = [];

  for (const rawSegment of rawSegments) {
    if (!isObject(rawSegment)) {
      continue;
    }

    const min = resolveGoalValue(
      isGoalValue(rawSegment.min) ? rawSegment.min : null,
      data,
    );
    const max = resolveGoalValue(
      isGoalValue(rawSegment.max) ? rawSegment.max : null,
      data,
    );

    if (min.error) {
      errors.push(min.error);
    }

    if (max.error) {
      errors.push(max.error);
    }

    const resolvedSegment = {
      color:
        typeof rawSegment.color === "string" ? rawSegment.color : undefined,
      label:
        typeof rawSegment.label === "string" ? rawSegment.label : undefined,
      min: min.value,
      max: max.value,
    };

    if (
      isResolvedGoalSegment(resolvedSegment) &&
      segmentIsValid(resolvedSegment)
    ) {
      segments.push(resolvedSegment);
    }
  }

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
