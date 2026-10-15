import _ from "underscore";

import type { GoalValueResult, ResolvedGoalSegment } from "metabase/viz-core";

import type { GaugeRange } from "./types";

/**
 * Places a warning halfway between the known bounds around each run of
 * consecutive bounds that failed to resolve, once per spot on the arc.
 * `boundResults` follow the order of `getGoalSegmentBounds`.
 */
export function getGaugeWarningValues(
  boundResults: GoalValueResult[],
  [rangeMin, rangeMax]: GaugeRange,
): number[] {
  const { values, previousValue, hasPendingError } = boundResults.reduce<{
    values: number[];
    previousValue: number;
    hasPendingError: boolean;
  }>(
    (acc, { value, error }) => {
      if (error != null) {
        return { ...acc, hasPendingError: true };
      }

      if (value == null) {
        return acc;
      }

      return {
        values: acc.hasPendingError
          ? [...acc.values, (acc.previousValue + value) / 2]
          : acc.values,
        previousValue: value,
        hasPendingError: false,
      };
    },
    { values: [], previousValue: rangeMin, hasPendingError: false },
  );
  const lastValues = hasPendingError
    ? [...values, (previousValue + rangeMax) / 2]
    : values;

  return _.uniq(lastValues.map(clampToRange));

  function clampToRange(value: number) {
    return Math.min(Math.max(value, rangeMin), rangeMax);
  }
}

export function getSegmentsRange(
  segments: ResolvedGoalSegment[],
): GaugeRange | null {
  const bounds = segments.flatMap((segment) => [segment.min, segment.max]);
  return bounds.length > 0 ? [Math.min(...bounds), Math.max(...bounds)] : null;
}

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
