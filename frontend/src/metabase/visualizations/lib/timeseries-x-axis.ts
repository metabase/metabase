import * as d3 from "d3";
import dayjs from "dayjs";

import { isNotNull } from "metabase/utils/types";
import type {
  DateRange,
  TimeSeriesInterval,
} from "metabase/visualizations/echarts/cartesian/model/types";
import {
  computeTimeseriesDataInterval,
  minTimeseriesUnit,
} from "metabase/visualizations/echarts/cartesian/utils/timeseries";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { Series } from "metabase-types/api";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

import { getXValues, isTimeseries } from "./renderer_utils";

export interface TimeseriesXAxis {
  domain: DateRange | null;
  interval: TimeSeriesInterval | null;
}

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
