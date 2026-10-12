import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import type { CartesianChartColumns } from "../../lib/graph/columns";
import { getCartesianChartColumns } from "../../lib/graph/columns";
import type { ColumnFormatter } from "../types/format";

import { getSeriesColors } from "./colors";
import { getOrderedSeries, getSeries } from "./data";

export const getTwoDimensionalChartSeries = (
  data: DatasetData,
  settings: VisualizationSettings,
  columnFormatter: ColumnFormatter,
) => {
  const chartColumns = getCartesianChartColumns(data.cols, settings);
  const unorderedSeries = getSeries(
    data,
    chartColumns,
    columnFormatter,
    settings,
  );
  const seriesOrder = settings["graph.series_order"];
  const series = getOrderedSeries(unorderedSeries, seriesOrder);

  const seriesColors = getSeriesColors(settings, series);

  return {
    chartColumns,
    series,
    seriesColors,
  };
};

export const getLabelsMetricColumn = (chartColumns: CartesianChartColumns) => {
  // For multi-metrics charts we use the first metric column settings for formatting
  return "breakout" in chartColumns
    ? chartColumns.metric
    : chartColumns.metrics[0];
};

export const getChartMetrics = (chartColumns: CartesianChartColumns) => {
  return "breakout" in chartColumns
    ? [chartColumns.metric]
    : chartColumns.metrics;
};
