import * as d3 from "d3";
import dayjs from "dayjs";

import { isNotNull } from "metabase/utils/types";
import {
  type ComputedVisualizationSettings,
  type DateRange,
  type TimeSeriesInterval,
  computeTimeseriesDataInterval,
  getXValues,
  isTimeseries,
  minTimeseriesUnit,
} from "metabase/viz-core";
import type { Series } from "metabase-types/api";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

export interface TimeseriesXAxis {
  domain: DateRange | null;
  interval: TimeSeriesInterval | null;
}

/**
 * Domain and data interval of a time series x axis, derived from the raw x
 * values the way the legacy renderer does it. Returns null for charts whose x
 * axis is not a time series.
 */
export const getTimeseriesXAxis = (
  series: Series,
  settings: ComputedVisualizationSettings,
): TimeseriesXAxis | null => {
  if (!isTimeseries(settings)) {
    return null;
  }
  const xValues = getXValues({ series, settings });
  const [min, max] = d3.extent(xValues.filter(dayjs.isDayjs));
  const columns = series[0]?.data?.cols ?? [];
  const columnUnits = (settings["graph.dimensions"] ?? [])
    .map((dimension) => columns.find((column) => column?.name === dimension))
    .map((column) =>
      isAbsoluteDateTimeUnit(column?.unit) ? column.unit : null,
    )
    .filter(isNotNull);
  return {
    domain: min && max ? [min, max] : null,
    interval:
      computeTimeseriesDataInterval(xValues, minTimeseriesUnit(columnUnits)) ??
      null,
  };
};
