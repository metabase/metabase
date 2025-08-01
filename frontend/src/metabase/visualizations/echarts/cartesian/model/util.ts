import type { OptionsType } from "metabase/lib/formatting/types";
import {
  expectedTickCount,
  maxTicksForChartWidth,
} from "metabase/visualizations/echarts/cartesian/utils/timeseries";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";

import {
  NEGATIVE_BAR_DATA_LABEL_KEY_SUFFIX,
  POSITIVE_BAR_DATA_LABEL_KEY_SUFFIX,
} from "../constants/dataset";

import type {
  DataKey,
  TimeSeriesAxisFormatter,
  TimeSeriesInterval,
} from "./types";

export function getBarSeriesDataLabelKey(dataKey: DataKey, sign: "+" | "-") {
  if (sign === "+") {
    return `${dataKey}_${POSITIVE_BAR_DATA_LABEL_KEY_SUFFIX}`;
  }
  return `${dataKey}_${NEGATIVE_BAR_DATA_LABEL_KEY_SUFFIX}`;
}

export function getFormattingOptionsWithoutScaling(options: OptionsType) {
  return { ...options, scale: undefined };
}

export function getColumnScaling(
  column: RemappingHydratedDatasetColumn,
  settings: ComputedVisualizationSettings,
) {
  const columnSettings =
    settings.column?.(column) ?? getColumnSettings(settings, column);
  const scale = columnSettings?.scale;
  return Number.isFinite(scale) ? (scale as number) : 1;
}

export function shouldPinInterval(
  interval: TimeSeriesInterval,
  timeRangeMs: number,
  chartWidth: number,
  formatter: TimeSeriesAxisFormatter,
) {
  const capacity = maxTicksForChartWidth(chartWidth, formatter);
  const tickCount = expectedTickCount(interval, timeRangeMs);
  return tickCount <= capacity;
}
