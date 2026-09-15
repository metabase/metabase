import { type Dayjs, dayjs } from "metabase/dayjs";

import type { Extent } from "../../../types";
import type { ChartLayout, DashboardXAxis } from "../layout/types";
import type { TimeSeriesInterval, TimeSeriesXAxisModel } from "../model/types";

import { getTicksOptions } from "./ticks";
import { getXAxisLabelValues } from "./x-axis-labels";
import {
  getDashboardXAxisLayout,
  getXAxisLabelPadding,
  getXAxisWidth,
} from "./x-axis-padding";

export function getTimeAxisPadding(
  axis: TimeSeriesXAxisModel,
  chartLayout: ChartLayout,
): DashboardXAxis | undefined {
  if (
    !axis.isDashboard ||
    axis.intervalsCount <= 0 ||
    (chartLayout.axisEnabledSetting !== true &&
      chartLayout.axisEnabledSetting !== "compact")
  ) {
    return undefined;
  }

  const { formatter, xDomain, largestInterval } = getTicksOptions(
    axis,
    chartLayout,
  );
  const formatLabel = (value: number) =>
    formatter(
      axis.fromEChartsAxisValue(value).format("YYYY-MM-DDTHH:mm:ss[Z]"),
    );
  const layout = getDashboardXAxisLayout(
    xDomain,
    chartLayout,
    formatLabel(xDomain[0]),
    formatLabel(xDomain[1]),
    axis.intervalsCount,
  );
  if (!layout) {
    return undefined;
  }

  const customValues = getTimeAxisLabelValues(
    xDomain,
    layout.extent,
    largestInterval,
    chartLayout,
    formatLabel,
    layout.centerLabels,
  );
  if (!customValues) {
    return undefined;
  }

  return {
    step: layout.step,
    options: {
      type: "time",
      min: layout.extent[0],
      max: layout.extent[1],
      containShape: false,
      axisLabel: {
        customValues,
        formatter: formatLabel,
        ...layout.axisLabel,
        hideOverlap: false,
        showMinLabel: true,
        showMaxLabel: true,
      },
    },
  };
}

function getCalendarIndex(
  date: Dayjs,
  unit: TimeSeriesInterval["unit"],
): number {
  switch (unit) {
    case "year":
      return date.year();
    case "quarter":
      return date.quarter() - 1;
    case "month":
      return date.month();
    case "week":
      return 0;
    case "day":
      return date.date() - 1;
    case "hour":
      return date.hour();
    case "minute":
      return date.minute();
    case "second":
      return date.second();
    case "ms":
      return date.millisecond();
  }
}

export function getTimeAxisLabelValues(
  [min, max]: Extent,
  paddedExtent: Extent,
  interval: TimeSeriesInterval,
  chartLayout: ChartLayout,
  formatLabel: (value: number) => string,
  centerEndpoints = false,
): number[] | undefined {
  const start = dayjs.utc(min);
  const end = dayjs.utc(max);
  if (
    !start.isValid() ||
    !end.isValid() ||
    min >= max ||
    !Number.isFinite(interval.count) ||
    interval.count <= 0
  ) {
    return undefined;
  }

  const unit = interval.unit === "quarter" ? "month" : interval.unit;
  const unitMultiplier = interval.unit === "quarter" ? 3 : 1;
  const count = interval.count * unitMultiplier;
  let firstInterior = start.startOf(
    interval.unit === "week" ? "day" : interval.unit,
  );
  const calendarIndex = getCalendarIndex(firstInterior, interval.unit);
  const alignmentOffset =
    (interval.count - (calendarIndex % interval.count)) % interval.count;
  firstInterior = firstInterior.add(alignmentOffset * unitMultiplier, unit);
  if (firstInterior.valueOf() <= min) {
    firstInterior = firstInterior.add(count, unit);
  }

  let interiorCount = 0;
  if (firstInterior.valueOf() < max) {
    interiorCount = Math.floor(end.diff(firstInterior, unit) / count) + 1;
    const lastInterior = firstInterior.add((interiorCount - 1) * count, unit);
    if (lastInterior.valueOf() >= max) {
      interiorCount--;
    }
  }

  const axisWidth = getXAxisWidth(chartLayout);
  const [paddedMin, paddedMax] = paddedExtent;
  return getXAxisLabelValues({
    deduplicateLabels: true,
    centerEndpoints,
    valuesCount: interiorCount + 2,
    getValue: (index) => {
      if (index === 0) {
        return min;
      }
      if (index === interiorCount + 1) {
        return max;
      }
      return firstInterior.add((index - 1) * count, unit).valueOf();
    },
    getPosition: (value) =>
      ((value - paddedMin) / (paddedMax - paddedMin)) * axisWidth,
    formatLabel,
    getLabelWidth: chartLayout.ticksDimensions.getXTickWidth,
    axisWidth,
    padding: getXAxisLabelPadding(axisWidth),
  });
}
