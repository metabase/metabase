import { Model, helper } from "echarts/core";
import type { YAXisOption } from "echarts/types/dist/shared";

import {
  type FormatDurationOptions,
  getDurationTickInterval,
} from "metabase/utils/formatting";

import { PLOT_HEIGHT_BREAKPOINTS } from "../../../shared/constants/layout";
import type { Extent } from "../../../types";

export type ValueAxisOption = Extract<YAXisOption, { type?: "value" }>;

/** Lets ECharts include zero after applying boundary gaps, as native axes do. */
class ValueAxisScaleModel extends Model<ValueAxisOption> {
  needIncludeZero() {
    return !this.option.scale;
  }
}

function getResponsiveYAxisSegments(height: number) {
  return height < PLOT_HEIGHT_BREAKPOINTS.medium ? 2 : 4;
}

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

export function getResponsiveDurationYAxisTicks(
  extent: Extent,
  axis: ValueAxisOption,
  height: number,
  durationOptions: FormatDurationOptions,
) {
  const ticks = getDurationYAxisTicks(
    extent,
    axis,
    getResponsiveYAxisSegments(height),
    durationOptions,
  );
  const hasBoundLabelsOnly = height < PLOT_HEIGHT_BREAKPOINTS.small;

  return hasBoundLabelsOnly
    ? {
        ...ticks,
        axisLabel: {
          ...ticks.axisLabel,
          customValues: [ticks.min, ticks.max].filter(
            (bound) => typeof bound === "number",
          ),
        },
      }
    : ticks;
}

/** Uses the final axis options so explicit ticks share ECharts' rendered scale. */
export function getResponsiveYAxisTicks(
  extent: Extent,
  axis: ValueAxisOption,
  height: number,
) {
  const scale = helper.createScale(extent, new ValueAxisScaleModel(axis));
  const [min, max] = scale.getExtent();
  const segments = getResponsiveYAxisSegments(height);
  const gridlines = Array.from({ length: segments + 1 }, (_, index) =>
    index === segments ? max : min + ((max - min) * index) / segments,
  );
  // the smallest plots label their min and max gridlines only
  const labelInterval = height < PLOT_HEIGHT_BREAKPOINTS.small ? 2 : 1;

  return {
    ...axis,
    axisTick: { ...axis.axisTick, customValues: gridlines },
    axisLabel: {
      ...axis.axisLabel,
      customValues: gridlines.filter((_, index) => index % labelInterval === 0),
    },
    minorSplitLine: { ...axis.minorSplitLine, show: false },
  };
}
