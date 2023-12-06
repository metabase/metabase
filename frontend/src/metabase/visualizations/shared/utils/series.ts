import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getCartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { ColumnFormatter } from "metabase/visualizations/shared/types/format";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import { getSeriesColors } from "./colors";
import { getOrderedSeries, getSeries } from "./data";

export const getTwoDimensionalChartSeries = (
  data: DatasetData,
  settings: VisualizationSettings,
  columnFormatter: ColumnFormatter,
) => {
  const chartColumns = getCartesianChartColumns(data.cols, settings);
  const unorderedSeries = getSeries(data, chartColumns, columnFormatter);
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
