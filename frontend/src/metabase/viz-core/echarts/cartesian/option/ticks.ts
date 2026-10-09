import { type Dayjs, dayjs } from "metabase/dayjs";

import type { ContinuousDomain } from "../../../shared/types/scale";
import type { ChartLayout } from "../layout/types";
import type {
  TimeSeriesAxisFormatter,
  TimeSeriesXAxisModel,
  WaterfallXAxisModel,
} from "../model/types";
import {
  computeTimeseriesTicksInterval,
  getFormatter,
  getGridTickDates,
  getLargestInterval,
  getTickGrid,
  getTimeSeriesIntervalDuration,
} from "../utils/timeseries";

// HACK: ECharts in some cases do not render two ticks on line charts with 1 interval (2 values) when minInterval is defined.
// For example, when a dataset has two days and minInterval is 1 day in milliseconds datasets like ["2022-01-01", "2022-01-02"]
// will be rendered without the second tick. However, for ["2022-01-02", "2022-01-03"] ECharts would correctly render two ticks as needed.
// The workaround is to add more padding on sides for this corner case.
export const getPadding = (intervalsCount: number) => {
  if (intervalsCount <= 1) {
    return 5 / 6;
  }

  return 0.5;
};

export const getTicksOptions = (
  xAxisModel: TimeSeriesXAxisModel & Pick<WaterfallXAxisModel, "totalXValue">,
  chartLayout: ChartLayout,
) => {
  const { range, toEChartsAxisValue, interval, intervalsCount, totalXValue } =
    xAxisModel;
  // A waterfall's Total bar sits one interval after the last data point.
  const totalEChartsValue =
    totalXValue == null ? null : toEChartsAxisValue(totalXValue);
  const totalDate =
    totalEChartsValue == null ? null : dayjs.utc(totalEChartsValue);

  let formatter: TimeSeriesAxisFormatter = xAxisModel.formatter;

  // Unjustified type cast. FIXME
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

  const grid = getTickGrid(largestInterval, interval.unit, isSingleItem);

  if (grid == null) {
    // ECharts picks the ticks: millisecond data, or a single quarterly point.
    return {
      formatter,
      minInterval: getTimeSeriesIntervalDuration(largestInterval),
      customValues: undefined,
      canRender: isWithinRange,
      xDomainPadded,
    };
  }

  // ECharts anchors multi-unit tick grids (every 2 years, every 3 hours…) at
  // the axis extent, so the first boundaries inside the range can go unlabeled
  // while the data has already started. Hand ECharts the exact tick dates
  // instead: the grid from the first boundary inside the padded axis, and a
  // waterfall's Total, which replaces the grid tick closer than one step to it
  // so the Total label has room.
  const weekday = range[0].day();
  const hasRoomBeforeTotal = (date: Dayjs) =>
    totalDate == null || totalDate.diff(date, grid.unit, true) >= grid.step;
  const ticks = getGridTickDates(
    grid,
    xAxisModel.fromEChartsAxisValue(xDomainPadded[0]),
    xAxisModel.fromEChartsAxisValue(xDomainPadded[1]),
    weekday,
    false,
  ).filter(hasRoomBeforeTotal);
  if (totalDate != null && isWithinRange(totalDate)) {
    ticks.push(totalDate);
  }

  const customValues = ticks.map((date) => date.valueOf());
  const tickValues = new Set(customValues);

  return {
    formatter,
    minInterval: undefined,
    customValues,
    canRender: (date: Dayjs) => tickValues.has(date.valueOf()),
    xDomainPadded,
  };
};
