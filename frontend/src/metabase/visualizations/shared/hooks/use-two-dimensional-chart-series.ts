import { useMemo } from "react";
import { DatasetData, VisualizationSettings } from "metabase-types/api";
import { getChartColumns } from "metabase/visualizations/lib/graph/columns";
import { ColumnFormatter } from "metabase/visualizations/shared/types/format";
import { getSeries } from "../utils/data";
import { getSeriesColors } from "../utils/colors";
import { TwoDimensionalChartData } from "../types/data";

export const useTwoDimensionalChartSeries = (
  data: TwoDimensionalChartData,
  settings: VisualizationSettings,
  columnFormatter: ColumnFormatter,
) => {
  const chartColumns = useMemo(
    () => getChartColumns(data, settings),
    [data, settings],
  );

  const seriesOrder = useMemo(() => {
    const seriesOrderSettings = settings["graph.series_order"];
    if (!seriesOrderSettings) {
      return;
    }

    return seriesOrderSettings
      .filter(setting => setting.enabled)
      .map(setting => setting.name);
  }, [settings]);

  const series = useMemo(
    () => getSeries(data, chartColumns, columnFormatter, seriesOrder),
    [chartColumns, columnFormatter, data, seriesOrder],
  );

  const seriesColors = useMemo(
    () => getSeriesColors(settings, series),
    [series, settings],
  );

  return {
    chartColumns,
    series,
    seriesColors,
  };
};
