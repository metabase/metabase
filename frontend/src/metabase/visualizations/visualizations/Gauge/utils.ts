import { match } from "ts-pattern";

import type {
  GoalRefError,
  GoalValueResult,
  ResolvedGoalSegment,
} from "metabase/viz-core";

import { FONT_SIZE_SEGMENT_LABEL } from "./constants";
import type { GaugeRange } from "./types";

type Point = [number, number];

export type GaugeLabelBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const LABEL_CENTERED_MAX_X = 5;
// approximates the descenders below the baseline
const LABEL_DESCENT = FONT_SIZE_SEGMENT_LABEL / 4;
const WARNING_LABEL_GAP = 1;

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

export const getLabelTextAnchor = (x: number) => {
  if (Math.abs(x) < LABEL_CENTERED_MAX_X) {
    return "middle";
  }

  return x > 0 ? "start" : "end";
};

// shifts labels in the lower half down a bit
export const getLabelBaselineShift = (y: number) =>
  y > 0 ? FONT_SIZE_SEGMENT_LABEL / 2 : 0;

export function getLabelBox([x, y]: Point, width: number): GaugeLabelBox {
  const left = match(getLabelTextAnchor(x))
    .with("middle", () => x - width / 2)
    .with("start", () => x)
    .with("end", () => x - width)
    .exhaustive();
  const baseline = y + getLabelBaselineShift(y);

  return {
    left,
    right: left + width,
    top: baseline - FONT_SIZE_SEGMENT_LABEL,
    bottom: baseline + LABEL_DESCENT,
  };
}

/**
 * Moves a warning icon centered `radius` away from the gauge center along
 * `direction` (a unit vector) until it no longer overlaps any label.
 */
export function getWarningRadiusClearOfLabels(
  direction: Point,
  radius: number,
  iconSize: number,
  labelBoxes: GaugeLabelBox[],
): number {
  const iconBox = getIconBox(direction, radius, iconSize);
  const overlappingBoxes = labelBoxes.filter((box) =>
    doBoxesOverlap(iconBox, box),
  );

  if (overlappingBoxes.length === 0) {
    return radius;
  }

  return getWarningRadiusClearOfLabels(
    direction,
    Math.max(
      ...overlappingBoxes.map((box) =>
        getRadiusClearOfBox(direction, iconSize, box),
      ),
    ),
    iconSize,
    labelBoxes,
  );
}

function getIconBox(
  [dx, dy]: Point,
  radius: number,
  iconSize: number,
): GaugeLabelBox {
  const [x, y] = [dx * radius, dy * radius];

  return {
    left: x - iconSize / 2,
    right: x + iconSize / 2,
    top: y - iconSize / 2,
    bottom: y + iconSize / 2,
  };
}

const doBoxesOverlap = (a: GaugeLabelBox, b: GaugeLabelBox) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// the smallest radius at which the icon clears the box on either axis
function getRadiusClearOfBox(
  [dx, dy]: Point,
  iconSize: number,
  box: GaugeLabelBox,
): number {
  const clearance = iconSize / 2 + WARNING_LABEL_GAP;

  return Math.min(
    dx > 0 ? (box.right + clearance) / dx : Infinity,
    dx < 0 ? (box.left - clearance) / dx : Infinity,
    dy > 0 ? (box.bottom + clearance) / dy : Infinity,
    dy < 0 ? (box.top - clearance) / dy : Infinity,
  );
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
