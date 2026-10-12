import type { EChartsCoreOption } from "echarts/core";

import { dayjs } from "metabase/dayjs";
import { isNotNull } from "metabase/utils/types";
import {
  type BaseCartesianChartModel,
  type ChartDataset,
  type DataKey,
  type HighlightedObject,
  type HoveredObject,
  type SeriesModel,
  X_AXIS_DATA_KEY,
  getDashboardAdjustedSettings,
  getDatasetKey,
} from "metabase/viz-core";
import type { RawSeries } from "metabase-types/api";

import { normalizeDimensionValue } from "./events";
import type { CartesianHoveredObject } from "./types";

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

export const getHoveredFromHighlighted = (
  highlighted: HighlightedObject,
  rawSeries: RawSeries,
  chartModel: BaseCartesianChartModel,
): CartesianHoveredObject | null => {
  if (!highlighted.dimensions || rawSeries.length === 0) {
    return null;
  }

  const cardId = highlighted.cardId ?? rawSeries[0].card.id;
  const rawSeriesIndex = rawSeries.findIndex((s) => s.card.id === cardId);
  const cardColumns = chartModel.cardsColumns[rawSeriesIndex];

  if (!cardColumns) {
    return null;
  }

  const metricColumn =
    "metric" in cardColumns
      ? cardColumns.metric.column
      : cardColumns.metrics.length === 1
        ? cardColumns.metrics[0].column
        : cardColumns.metrics.find(
            (m) => m.column.name === highlighted.columnName,
          )?.column;

  if (!metricColumn) {
    return null;
  }

  const breakoutColumn =
    "breakout" in cardColumns ? cardColumns.breakout.column : null;
  const highlightedBreakoutDimension = highlighted.dimensions?.find(
    (d) => d.columnName === breakoutColumn?.name,
  );

  if (breakoutColumn && !highlightedBreakoutDimension) {
    return null;
  }

  const breakoutValue = highlightedBreakoutDimension?.value;

  const seriesDataKey = getDatasetKey(metricColumn, cardId, breakoutValue);
  const seriesIndex = chartModel.seriesModels.findIndex(
    (s) => s.dataKey === seriesDataKey,
  );

  if (seriesIndex === -1) {
    return null;
  }

  const highlightedXAxisDimension = highlighted.dimensions.find(
    (d) => d.columnName === cardColumns.dimension.column.name,
  );

  if (!highlightedXAxisDimension) {
    return null;
  }

  const datumIndex = chartModel.dataset.findIndex((d) => {
    return (
      normalizeDimensionValue(
        cardColumns.dimension.column,
        d[X_AXIS_DATA_KEY],
      ) === highlightedXAxisDimension.value
    );
  });

  if (datumIndex === -1) {
    return null;
  }

  return {
    index: seriesIndex,
    datumIndex,
    shouldShowTooltip: highlighted.shouldShowTooltip,
  };
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
