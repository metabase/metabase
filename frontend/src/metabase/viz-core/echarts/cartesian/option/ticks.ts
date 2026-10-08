import { type Dayjs, dayjs } from "metabase/dayjs";

import type { ContinuousDomain } from "../../../shared/types/scale";
import type { ChartLayout } from "../layout/types";
import type {
  TimeSeriesAxisFormatter,
  TimeSeriesInterval,
  TimeSeriesXAxisModel,
  WaterfallXAxisModel,
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
  let minInterval: number | undefined;
  let maxInterval: number | undefined;

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

  // ECharts anchors multi-unit tick grids (every 2 years, every 3 hours…) at
  // the axis extent, so the first boundaries inside the range can go unlabeled
  // while the data has already started. Ask ECharts for a tick at every single
  // unit instead and apply the grid here, starting from the first boundary of
  // its unit inside the padded axis. A waterfall drops the grid tick closer
  // than one step to the Total so the Total label has room.
  const grid = getTickGrid(largestInterval, interval.unit, isSingleItem);
  let isGridTick: (date: Dayjs) => boolean = () => true;

  if (grid != null) {
    const paddedMinDate = xAxisModel.fromEChartsAxisValue(xDomainPadded[0]);
    const weekday = range[0].day();
    const isBoundary = (date: Dayjs) =>
      isUnitBoundary(date, grid.unit, weekday);
    const anchor = findFirstBoundary(paddedMinDate, grid.unit, isBoundary);
    const hasRoomBeforeTotal = (date: Dayjs) =>
      totalDate == null || totalDate.diff(date, grid.unit, true) >= grid.step;
    isGridTick = (date: Dayjs) =>
      isBoundary(date) &&
      Math.round(date.diff(anchor, grid.unit, true)) % grid.step === 0 &&
      hasRoomBeforeTotal(date);
    maxInterval = getTimeSeriesIntervalDuration({
      count: 1,
      unit: grid.ticksUnit,
    });
  }

  // A waterfall's Total is labeled even when the grid would skip it.
  const isTotalTick = (date: Dayjs) =>
    totalDate != null && date.isSame(totalDate, interval.unit);

  const canRender = (date: Dayjs) =>
    isWithinRange(date) && (isGridTick(date) || isTotalTick(date));

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

interface TickGrid {
  unit: TimeSeriesInterval["unit"];
  step: number;
  // The unit ECharts emits ticks at. Weeks and months use days because ECharts
  // has no weekly ticks and a fixed month interval in milliseconds skips short
  // months; quarters use months for the same reason.
  ticksUnit: TimeSeriesInterval["unit"];
}

// Quarter grids over finer data step three months from the first month in
// range rather than from a calendar quarter; quarterly data starts on quarter
// boundaries anyway, so its labels stay calendar quarters.
function getTickGrid(
  { unit, count }: TimeSeriesInterval,
  dataUnit: TimeSeriesInterval["unit"],
  isSingleItem: boolean,
): TickGrid | null {
  switch (unit) {
    case "week":
    case "month":
      return { unit, step: count, ticksUnit: "day" };
    case "quarter":
      // With a single point ECharts picks the quarter tick itself.
      if (isSingleItem) {
        return null;
      }
      return dataUnit === "quarter"
        ? { unit, step: count, ticksUnit: "month" }
        : { unit: "month", step: 3 * count, ticksUnit: "month" };
    case "year":
    case "day":
    case "hour":
    case "minute":
    case "second":
      return { unit, step: count, ticksUnit: unit };
    default:
      return null;
  }
}

function isUnitBoundary(
  date: Dayjs,
  unit: TimeSeriesInterval["unit"],
  weekday: number,
) {
  if (unit === "week") {
    return date.day() === weekday && date.startOf("day").isSame(date);
  }
  return date.startOf(unit).isSame(date);
}

function findFirstBoundary(
  paddedMin: Dayjs,
  unit: TimeSeriesInterval["unit"],
  isBoundary: (date: Dayjs) => boolean,
) {
  const step = unit === "week" ? "day" : unit;
  let boundary = paddedMin.startOf(step);
  while (!boundary.isAfter(paddedMin) || !isBoundary(boundary)) {
    boundary = boundary.add(1, step);
  }
  return boundary;
}
