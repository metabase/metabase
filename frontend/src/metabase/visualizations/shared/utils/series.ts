import type { ChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { ColumnFormatter } from "metabase/visualizations/shared/types/format";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import { getSeriesColors } from "./colors";
import { getOrderedSeries, getSeries } from "./data";

export const getTwoDimensionalChartSeries = (
  data: DatasetData,
  settings: VisualizationSettings,
  columnFormatter: ColumnFormatter,
) => {
  const chartColumns = getChartColumns(data, settings);
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

export const getLabelsMetricColumn = (chartColumns: ChartColumns) => {
  // For multi-metrics charts we use the first metic column settings for formatting
  return "breakout" in chartColumns
    ? chartColumns.metric
    : chartColumns.metrics[0];
};

export const getChartMetrics = (chartColumns: ChartColumns) => {
  return "breakout" in chartColumns
    ? [chartColumns.metric]
    : chartColumns.metrics;
};
