import _ from "underscore";

import type { GoalValueResult, ResolvedGoalSegment } from "metabase/viz-core";

import type { GaugeRange } from "./types";

/**
 * Places a warning for each segment with a bound that failed to resolve,
 * halfway between its known bound and the closest known bound past it on the
 * arc, once per spot on the arc. A segment with no known bound gets a warning
 * past the last known bound. `boundResults` follow the order of `getGoalSegmentBounds`.
 */
export function getGaugeWarningValues(
  boundResults: GoalValueResult[],
  [rangeMin, rangeMax]: GaugeRange,
): number[] {
  const knownValues = boundResults.flatMap(({ value }) =>
    value != null ? [value] : [],
  );
  const values = _.chunk(boundResults, 2).flatMap(getSegmentWarningValues);

  return _.uniq(values.map(clampToRange));

  function getSegmentWarningValues([min, max]: GoalValueResult[]): number[] {
    if (min.error == null && max.error == null) {
      return [];
    }

    if (min.value != null) {
      return [(min.value + getClosestKnownValueAbove(min.value)) / 2];
    }

    if (max.value != null) {
      return [(getClosestKnownValueBelow(max.value) + max.value) / 2];
    }

    return [(getLastKnownValue() + rangeMax) / 2];
  }

  function getClosestKnownValueAbove(value: number) {
    const valuesAbove = knownValues.filter((known) => known > value);
    return valuesAbove.length > 0 ? Math.min(...valuesAbove) : rangeMax;
  }

  function getClosestKnownValueBelow(value: number) {
    const valuesBelow = knownValues.filter((known) => known < value);
    return valuesBelow.length > 0 ? Math.max(...valuesBelow) : rangeMin;
  }

  function getLastKnownValue() {
    return knownValues.length > 0 ? Math.max(...knownValues) : rangeMin;
  }

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
