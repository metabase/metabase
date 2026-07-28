import dayjs from "dayjs";
import type { EChartsCoreOption } from "echarts/core";

import { isNotNull } from "metabase/utils/types";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  ChartDataset,
  DataKey,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { getDashboardAdjustedSettings } from "metabase/visualizations/shared/settings-adjustments";
import type { HoveredObject } from "metabase/visualizations/types";

export { getDashboardAdjustedSettings };

export const getHoveredSeriesDataKey = (
  seriesModels: SeriesModel[],
  hovered: HoveredObject | null | undefined,
): DataKey | null => {
  const seriesIndex = hovered?.index;
  if (seriesIndex == null) {
    return null;
  }

  return seriesModels[seriesIndex]?.dataKey ?? null;
};

export const getHoveredEChartsSeriesDataKeyAndIndex = (
  seriesModels: SeriesModel[],
  option: EChartsCoreOption,
  hovered: HoveredObject | null | undefined,
) => {
  const hoveredSeriesDataKey = getHoveredSeriesDataKey(seriesModels, hovered);

  const seriesOptions = Array.isArray(option?.series)
    ? option?.series
    : [option?.series].filter(isNotNull);

  // ECharts series contain goal line, trend lines, and timeline events so the series index
  // is different from one in chartModel.seriesModels
  const hoveredEChartsSeriesIndex = seriesOptions.findIndex(
    (series) => series.id === hoveredSeriesDataKey,
  );

  return { hoveredSeriesDataKey, hoveredEChartsSeriesIndex };
};

export const getDataSeriesEChartsIndices = (
  seriesModels: SeriesModel[],
  option: EChartsCoreOption,
): number[] => {
  const seriesOptions = Array.isArray(option?.series)
    ? option.series
    : [option?.series].filter(isNotNull);

  const visibleDataKeys = new Set(
    seriesModels.filter((series) => series.visible).map((s) => s.dataKey),
  );

  return seriesOptions.flatMap((series, index) =>
    visibleDataKeys.has(series.id) ? [index] : [],
  );
};

export const getClosestDatumIndex = (
  dataset: ChartDataset,
  date: string,
): number => {
  const target = dayjs.utc(date).valueOf();
  if (Number.isNaN(target)) {
    return -1;
  }

  return dataset.reduce(
    (best, datum, index) => {
      const value = datum[X_AXIS_DATA_KEY];
      const canParse =
        typeof value === "string" ||
        typeof value === "number" ||
        value instanceof Date;
      const timestamp = canParse ? dayjs.utc(value).valueOf() : NaN;

      if (Number.isNaN(timestamp)) {
        return best;
      }
      const diff = Math.abs(timestamp - target);
      return diff < best.diff ? { index, diff } : best;
    },
    { index: -1, diff: Infinity },
  ).index;
};
