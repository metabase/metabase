import * as d3 from "d3";

import { dayjs } from "metabase/dayjs";
import { isNotNull } from "metabase/utils/types";
import type { Series } from "metabase-types/api";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

import {
  computeTimeseriesDataInterval,
  minTimeseriesUnit,
} from "../echarts/cartesian/utils/timeseries";
import type { ComputedVisualizationSettings } from "../types/computed-settings";
import type { TimeseriesXAxis } from "../types/timeseries";

import { getXValues, isTimeseries } from "./renderer_utils";

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
