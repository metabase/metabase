import type { ResolvedGoalSegment } from "metabase/viz-core";

import type { GaugeRange } from "./types";

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
