import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

import type { ContinuousDomain } from "metabase/visualizations/shared/types/scale";

import type { ChartLayout } from "../layout/types";
import type {
  TimeSeriesAxisFormatter,
  TimeSeriesXAxisModel,
} from "../model/types";
import {
  computeTimeseriesTicksInterval,
  getFormatter,
  getLargestInterval,
  getTimeSeriesIntervalDuration,
} from "../utils/timeseries";

// HACK: ECharts in some cases do not render two ticks on line charts with 1 interval (2 values) when minInterval is defined.
// For example, when a dataset has two days and minInterval is 1 day in milliseconds datasets like ["2022-01-01", "2022-01-02"]
// will be rendered without the second tick. However, for ["2022-01-02", "2022-01-03"] ECharts would correctly render two ticks as needed.
// The workaround is to add more padding on sides for this corner case.
const getPadding = (intervalsCount: number) => {
  if (intervalsCount <= 1) {
    return 5 / 6;
  }

  return 0.5;
};

export const getTicksOptions = (
  xAxisModel: TimeSeriesXAxisModel,
  chartLayout: ChartLayout,
) => {
  const { range, toEChartsAxisValue, interval, intervalsCount } = xAxisModel;

  let formatter: TimeSeriesAxisFormatter = xAxisModel.formatter;
  let minInterval: number | undefined;
  let maxInterval: number | undefined;

  const xDomain = range.map((day) => {
    const adjustedDate = dayjs(toEChartsAxisValue(day.toISOString()));
    if (!adjustedDate) {
      throw new Error(`Invalid range dates: ${JSON.stringify(range)}`);
    }
    return adjustedDate.valueOf();
  }) as ContinuousDomain;

  const isSingleItem = xDomain[0] === xDomain[1];
  const padding = getPadding(intervalsCount);
  const xDomainPadded = [
    xDomain[0] - getTimeSeriesIntervalDuration(interval) * padding,
    xDomain[1] + getTimeSeriesIntervalDuration(interval) * padding,
  ];
  const paddedMin = dayjs(xDomainPadded[0]);
  const paddedMax = dayjs(xDomainPadded[1]);

  // Compute ticks interval based on the X-axis range, original interval, and the chart width.
  const computedInterval = computeTimeseriesTicksInterval(
    xDomain,
    interval,
    chartLayout,
    formatter,
  );
  const largestInterval = getLargestInterval([computedInterval, interval]);

  formatter = getFormatter(formatter, interval.unit, largestInterval.unit);

  const isWithinRange = (date: Dayjs) => {
    return date.isAfter(paddedMin) && date.isBefore(paddedMax);
  };

  let canRender: (value: Dayjs) => boolean = (date) => isWithinRange(date);

  // HACK: ECharts does not support weekly ticks internally and even by specifying minInterval=*week_duration*
  // it will not produce correct weekly ticks prioritizing start of months ticks. A workaround to this is to
  // force ECharts render daily ticks and then in formatter return actual formatted values only for days that
  // are start of week and an empty string for the rest.
  if (largestInterval.unit === "week") {
    const startOfWeek = range[0].day();
    canRender = (date: Dayjs) =>
      isWithinRange(date) &&
      date.day() === startOfWeek &&
      date.week() % largestInterval.count === 0;
    const effectiveTicksUnit = "day";
    maxInterval = getTimeSeriesIntervalDuration({
      count: 1,
      unit: effectiveTicksUnit,
    });
  }

  // HACK: For monthly ticks, we need to handle variable month lengths.
  // Setting a fixed minInterval causes ECharts to skip months because some months
  // (like February with 28 days) are shorter than others (31 days).
  // Instead, we force ECharts to generate daily ticks and filter to month starts.
  if (largestInterval.unit === "month") {
    canRender = (date: Dayjs) =>
      isWithinRange(date) &&
      date.date() === 1 &&
      date.month() % largestInterval.count === 0;
    maxInterval = getTimeSeriesIntervalDuration({
      count: 1,
      unit: "day",
    });
  }

  // HACK: Similarly to weekly ticks, ECharts does not support quarterly ticks natively.
  // If we let ECharts select ticks for quarterly data it can pick January and March which
  // will look like a duplication because both ticks will be formatted as Q1. So we need to
  // force ECharts to render monthly ticks and then select ones for Jan, Apr, Jul, Oct.
  if (!isSingleItem && largestInterval.unit === "quarter") {
    const effectiveTicksUnit = "month";
    canRender = (date: Dayjs) =>
      isWithinRange(date) &&
      date.startOf("quarter").isSame(date, "month") &&
      (date.quarter() - 1) % largestInterval.count === 0;
    maxInterval = getTimeSeriesIntervalDuration({
      count: 1,
      unit: effectiveTicksUnit,
    });
  }

  if (!maxInterval) {
    minInterval = getTimeSeriesIntervalDuration(largestInterval);
  }

  return {
    formatter,
    minInterval,
    maxInterval,
    canRender,
    xDomainPadded,
  };
};
