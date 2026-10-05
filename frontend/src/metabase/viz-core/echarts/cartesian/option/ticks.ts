import { type Dayjs, dayjs } from "metabase/dayjs";

import type { ContinuousDomain } from "../../../shared/types/scale";
import type { ChartLayout } from "../layout/types";
import type {
  TimeSeriesAxisFormatter,
  TimeSeriesInterval,
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
export const getPadding = (intervalsCount: number) => {
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

  let canRender: (value: Dayjs) => boolean = (date) => isWithinRange(date);

  // ECharts anchors multi-unit tick grids (every 2 years, every 15 minutes…)
  // at the axis extent and skips the first boundary inside the range when the
  // extent's own boundary falls before it. So for every unit we can enumerate,
  // ECharts is asked for a tick at every single unit and the grid is applied
  // here, starting from the first boundary inside the (padded) axis.
  const ticksUnit = getEChartsTicksUnit(largestInterval.unit, isSingleItem);
  if (ticksUnit != null) {
    const paddedMinDate = xAxisModel.fromEChartsAxisValue(xDomainPadded[0]);
    const isGridBoundary = getGridBoundaryPredicate(
      largestInterval.unit,
      range[0].day(),
    );
    const firstBoundary = findFirstBoundary(
      paddedMinDate,
      largestInterval.unit,
      isGridBoundary,
    );
    canRender = (date: Dayjs) =>
      isWithinRange(date) &&
      isGridBoundary(date) &&
      Math.round(date.diff(firstBoundary, largestInterval.unit, true)) %
        largestInterval.count ===
        0;
    maxInterval = getTimeSeriesIntervalDuration({ count: 1, unit: ticksUnit });
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

// The unit ECharts should emit a tick for. Weeks and months use days because
// ECharts has no weekly ticks and a fixed month interval in milliseconds skips
// short months; quarters use months for the same reason. Years and finer units
// are regular enough to be emitted directly.
function getEChartsTicksUnit(
  unit: TimeSeriesInterval["unit"],
  isSingleItem: boolean,
): TimeSeriesInterval["unit"] | null {
  switch (unit) {
    case "week":
    case "month":
    case "day":
      return "day";
    case "quarter":
      // With a single point ECharts picks the quarter tick itself.
      return isSingleItem ? null : "month";
    case "year":
    case "hour":
    case "minute":
    case "second":
      return unit;
    default:
      return null;
  }
}

function getGridBoundaryPredicate(
  unit: TimeSeriesInterval["unit"],
  dataWeekday: number,
) {
  if (unit === "week") {
    return (date: Dayjs) =>
      date.day() === dataWeekday && date.startOf("day").isSame(date);
  }
  return (date: Dayjs) => date.startOf(unit).isSame(date);
}

function findFirstBoundary(
  paddedMin: Dayjs,
  unit: TimeSeriesInterval["unit"],
  isGridBoundary: (date: Dayjs) => boolean,
) {
  const step = unit === "week" ? "day" : unit;
  let boundary = paddedMin.startOf(step);
  while (!boundary.isAfter(paddedMin) || !isGridBoundary(boundary)) {
    boundary = boundary.add(1, step);
  }
  return boundary;
}
