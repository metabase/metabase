import type {
  GoalRefError,
  GoalValueResult,
  ResolvedGoalSegment,
} from "metabase/viz-core";

import type { GaugeRange } from "./types";

export type GaugeWarning = {
  value: number;
  errors: GoalRefError[];
};

/**
 * Places a warning halfway between the known bounds around each run of
 * consecutive bounds that failed to resolve, merging warnings that land on the
 * same spot of the arc. `boundResults` follow the order of `getGoalSegmentBounds`.
 */
export function getGaugeWarnings(
  boundResults: GoalValueResult[],
  [rangeMin, rangeMax]: GaugeRange,
): GaugeWarning[] {
  const toWarning = (from: number, to: number, errors: GoalRefError[]) =>
    errors.length > 0 ? [{ value: (from + to) / 2, errors }] : [];

  const { warnings, previousValue, pendingErrors } = boundResults.reduce<{
    warnings: GaugeWarning[];
    previousValue: number;
    pendingErrors: GoalRefError[];
  }>(
    (acc, { value, error }) => {
      if (error != null) {
        return { ...acc, pendingErrors: [...acc.pendingErrors, error] };
      }

      if (value == null) {
        return acc;
      }

      return {
        warnings: [
          ...acc.warnings,
          ...toWarning(acc.previousValue, value, acc.pendingErrors),
        ],
        previousValue: value,
        pendingErrors: [],
      };
    },
    { warnings: [], previousValue: rangeMin, pendingErrors: [] },
  );

  const clampToRange = (value: number) =>
    Math.min(Math.max(value, rangeMin), rangeMax);

  return mergeWarningsWithSameValue(
    [...warnings, ...toWarning(previousValue, rangeMax, pendingErrors)].map(
      (warning) => ({ ...warning, value: clampToRange(warning.value) }),
    ),
  );
}

function mergeWarningsWithSameValue(warnings: GaugeWarning[]): GaugeWarning[] {
  const errorsByValue = new Map<number, GoalRefError[]>();

  warnings.forEach(({ value, errors }) => {
    errorsByValue.set(value, [...(errorsByValue.get(value) ?? []), ...errors]);
  });

  return Array.from(errorsByValue, ([value, errors]) => ({ value, errors }));
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
