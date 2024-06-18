import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

import type { ContinuousDomain } from "metabase/visualizations/shared/types/scale";

import type {
  TimeSeriesAxisFormatter,
  TimeSeriesXAxisModel,
} from "../model/types";
import {
  computeTimeseriesTicksInterval,
  getLargestInterval,
  getTimeSeriesIntervalDuration,
} from "../utils/timeseries";

// HACK: ECharts in some cases do not render two ticks on line charts with 1 interval (2 values) when minInterval is defined.
// For example, when a dataset has two days and minInterval is 1 day in milliseconds datasets like ["2022-01-01", "2022-01-02"]
// will be rendered without the second tick. However, for ["2022-01-02", "2022-01-03"] ECharts would corectly render two ticks as needed.
// The workaround is to add more padding on sides for this corner case.
const getPadding = (intervalsCount: number) => {
  if (intervalsCount === 1) {
    return 5 / 6;
  }

  return 0.5;
};

export const getTicksOptions = (
  xAxisModel: TimeSeriesXAxisModel,
  chartWidth: number,
) => {
  const { range, toEChartsAxisValue, interval, intervalsCount } = xAxisModel;

  let formatter: TimeSeriesAxisFormatter = xAxisModel.formatter;
  let minInterval: number | undefined;
  let maxInterval: number | undefined;

  const xDomain = range.map(day => {
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
    chartWidth,
    xAxisModel.formatter,
  );
  const largestInterval = getLargestInterval([computedInterval, interval]);

  // If the data interval is week but due to available space and the range of the chart
  // we decide to show monthly, yearly or even larger ticks, we should format ticks values as months.
  if (interval.unit === "week" && largestInterval.unit !== "week") {
    formatter = value => {
      return xAxisModel.formatter(value, "month");
    };
  }

  const isWithinRange = (date: Dayjs) => {
    return date.isAfter(paddedMin) && date.isBefore(paddedMax);
  };

  let canRender: (value: Dayjs) => boolean = date => isWithinRange(date);

  // HACK: ECharts does not support weekly ticks internally and even by specifying minInterval=*week_duration*
  // it will not produce correct weekly ticks prioritizing start of months ticks. A workaround to this is to
  // force ECharts render daily ticks and then in formatter return actual formatted values only for days that
  // are start of week and an empty string for the rest.
  if (largestInterval.unit === "week") {
    const startOfWeek = range[0].day();
    canRender = (date: Dayjs) =>
      isWithinRange(date) && date.day() === startOfWeek;
    const effectiveTicksUnit = "day";
    maxInterval = getTimeSeriesIntervalDuration({
      count: 1,
      unit: effectiveTicksUnit,
    });
  }

  // HACK: Similarly to weekly ticks, ECharts does not support quarterly ticks natively.
  // If we let ECharts select ticks for quarterly data it can pick January and March which
  // will look like a duplication because both ticks will be formatted as Q1. So we need to
  // force ECharts to render monthly ticks and then select ones for Jan, Apr, Jul, Oct.
  if (
    !isSingleItem &&
    largestInterval.unit === "month" &&
    largestInterval.count === 3
  ) {
    const effectiveTicksUnit = "month";
    canRender = (date: Dayjs) =>
      isWithinRange(date) && date.startOf("quarter").isSame(date, "month");
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
