import { VisualizationSettings } from "metabase-types/api";
import { getChartColumns } from "metabase/visualizations/lib/graph/columns";
import { ColumnFormatter } from "metabase/visualizations/shared/types/format";
import { TwoDimensionalChartData } from "../types/data";
import { getOrderedSeries, getSeries } from "./data";
import { getSeriesColors } from "./colors";

export const getTwoDimensionalChartSeries = (
  data: TwoDimensionalChartData,
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
