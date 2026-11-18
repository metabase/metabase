import type { YAXisOption } from "echarts/types/dist/shared";

import {
  type FormatDurationOptions,
  getDurationTickInterval,
} from "metabase/utils/formatting";

import type { Extent } from "../../../types";

export type ValueAxisOption = Extract<YAXisOption, { type?: "value" }>;

function getBoundaryGaps(axis: ValueAxisOption): [number, number] {
  const [lowerGap, upperGap] = Array.isArray(axis.boundaryGap)
    ? axis.boundaryGap
    : [];

  return [
    typeof lowerGap === "number" ? lowerGap : 0,
    typeof upperGap === "number" ? upperGap : 0,
  ];
}

function getValueAxisBounds(extent: Extent, axis: ValueAxisOption): Extent {
  const [dataMin, dataMax] = axis.scale
    ? extent
    : [Math.min(extent[0], 0), Math.max(extent[1], 0)];
  const [lowerGap, upperGap] = getBoundaryGaps(axis);
  const span = dataMax - dataMin;

  return [
    typeof axis.min === "number" ? axis.min : dataMin - span * lowerGap,
    typeof axis.max === "number" ? axis.max : dataMax + span * upperGap,
  ];
}

function getDurationAxisScale(
  [lower, upper]: Extent,
  maxSegments: number,
  durationOptions: FormatDurationOptions,
): { interval: number; min: number; max: number } {
  const interval = getDurationTickInterval(
    upper - lower,
    maxSegments,
    durationOptions,
  );
  const min = Math.floor(lower / interval) * interval;
  const max = Math.max(Math.ceil(upper / interval) * interval, min + interval);
  const segments = Math.round((max - min) / interval);

  return segments <= maxSegments
    ? { interval, min, max }
    : getDurationAxisScale([min, max], maxSegments, durationOptions);
}

export function getDurationYAxisTicks(
  extent: Extent,
  axis: ValueAxisOption,
  maxSegments: number,
  durationOptions: FormatDurationOptions,
) {
  const { interval, min, max } = getDurationAxisScale(
    getValueAxisBounds(extent, axis),
    maxSegments,
    durationOptions,
  );

  return {
    ...axis,
    interval,
    min: axis.min ?? min,
    max: axis.max ?? max,
  };
}
