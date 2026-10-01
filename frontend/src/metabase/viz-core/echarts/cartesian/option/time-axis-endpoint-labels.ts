import type { XAXisOption } from "echarts/types/dist/shared";

import { dayjs } from "metabase/dayjs";

import { HORIZONTAL_TICKS_GAP } from "../constants/style";
import type { ChartLayout } from "../layout/types";
import type {
  CartesianChartDateTimeAbsoluteUnit,
  TimeSeriesXAxisModel,
} from "../model/types";

import { getPadding } from "./ticks";
import {
  getXAxisEndpointInset,
  hasHorizontalXAxisLabels,
} from "./x-axis-endpoint-labels";

type TimeEndpointLabelOptions = Pick<
  NonNullable<XAXisOption["axisLabel"]>,
  | "showMinLabel"
  | "showMaxLabel"
  | "alignMinLabel"
  | "alignMaxLabel"
  | "padding"
> & {
  customValues?: number[];
};

// Label steps, in units, that read as calendar-aligned when they divide the range.
const CALENDAR_STEPS: Record<CartesianChartDateTimeAbsoluteUnit, number[]> = {
  ms: [1, 2, 5, 10, 20, 50, 100, 200, 500],
  second: [1, 5, 10, 15, 30, 60],
  minute: [1, 5, 10, 15, 30, 60],
  hour: [1, 2, 3, 6, 12, 24],
  day: [1, 2, 7, 14],
  week: [1, 2, 4, 13, 26, 52],
  month: [1, 2, 3, 6, 12, 24, 60, 120],
  quarter: [1, 2, 4, 8, 20],
  year: [1, 2, 5, 10, 20, 25, 50, 100],
};

const MAX_LABELS = 50;

// ECharts (`containShape`) widens a continuous axis that carries bars by half
// a data interval on each side so the outer bars are not clipped.
const BAR_AXIS_EXTRA_PADDING = 0.5;

/**
 * Pins the first and last data points as the endpoint labels and fills the
 * range with evenly spaced labels: a calendar step when one divides the range
 * and fits, otherwise even spacing snapped to data points. An endpoint label
 * that would cross the plot inset when centered is aligned inward instead.
 * Data positions never move.
 */
export function getTimeAxisEndpointLabelOptions(
  { range, interval, intervalsCount, toEChartsAxisValue }: TimeSeriesXAxisModel,
  { axisEnabledSetting, boundaryWidth, ticksDimensions }: ChartLayout,
  formatLabel: (value: number) => string,
  hasBarSeries = false,
): TimeEndpointLabelOptions {
  if (intervalsCount < 1 || !hasHorizontalXAxisLabels(axisEnabledSetting)) {
    return {};
  }

  const firstValue = toEChartsAxisValue(range[0].toISOString());
  if (firstValue == null) {
    return {};
  }
  const first = dayjs.utc(firstValue);
  const valueAt = (intervalIndex: number) =>
    first.add(intervalIndex * interval.count, interval.unit).valueOf();

  const domainPadding =
    getPadding(intervalsCount) + (hasBarSeries ? BAR_AXIS_EXTRA_PADDING : 0);
  const intervalWidth = boundaryWidth / (intervalsCount + 2 * domainPadding);
  const edgeOffset = domainPadding * intervalWidth;
  const positionAt = (intervalIndex: number) =>
    edgeOffset + intervalIndex * intervalWidth;

  const widths = new Map<number, number>();
  const labelWidth = (intervalIndex: number) => {
    let width = widths.get(intervalIndex);
    if (width === undefined) {
      width = ticksDimensions.getXTickWidth(
        formatLabel(valueAt(intervalIndex)),
      );
      widths.set(intervalIndex, width);
    }
    return width;
  };

  const inset = getXAxisEndpointInset(boundaryWidth);
  const crossesInset = (intervalIndex: number) =>
    edgeOffset - labelWidth(intervalIndex) / 2 < inset;
  const alignFirst = crossesInset(0);
  const alignLast = crossesInset(intervalsCount);
  // An inward-aligned label starts at its data point, which for dense data is
  // still inside the inset; horizontal padding pushes it the rest of the way.
  const labelPadding =
    alignFirst || alignLast ? Math.max(inset - edgeOffset, 0) : 0;

  const fits = (indices: number[]) => {
    const last = indices.length - 1;
    let previousRight = -Infinity;
    for (let i = 0; i <= last; i++) {
      const position = positionAt(indices[i]);
      const boxWidth = labelWidth(indices[i]) + 2 * labelPadding;
      const left =
        i === 0 && alignFirst
          ? position
          : i === last && alignLast
            ? position - boxWidth
            : position - boxWidth / 2;
      if (left < previousRight + HORIZONTAL_TICKS_GAP) {
        return false;
      }
      previousRight = left + boxWidth;
    }
    return true;
  };

  const calendarIndices = CALENDAR_STEPS[interval.unit]
    .map((units) => units / interval.count)
    .filter(
      (step) =>
        Number.isInteger(step) && step >= 1 && intervalsCount % step === 0,
    )
    .map((step) =>
      Array.from({ length: intervalsCount / step + 1 }, (_, i) => i * step),
    );
  const maxLabelCount = Math.min(intervalsCount + 1, MAX_LABELS);
  const evenIndices = Array.from(
    { length: maxLabelCount - 1 },
    (_, i) => maxLabelCount - i,
  ).map((count) =>
    Array.from({ length: count }, (_, i) =>
      Math.round((i * intervalsCount) / (count - 1)),
    ),
  );
  const indices = calendarIndices.find(fits) ?? evenIndices.find(fits) ?? [0];

  return {
    customValues: indices.map(valueAt),
    showMinLabel: true,
    showMaxLabel: true,
    ...(alignFirst ? { alignMinLabel: "left" as const } : {}),
    ...(alignLast ? { alignMaxLabel: "right" as const } : {}),
    ...(labelPadding > 0 ? { padding: [0, labelPadding] } : {}),
  };
}
