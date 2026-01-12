import type { LegendItem } from "metabase/visualizations/echarts/cartesian/model/types";
import type { Series } from "metabase/visualizations/shared/components/RowChart/types";

export const getLegendItems = <TDatum>(
  multipleSeries: Series<TDatum>[],
  seriesColors: Record<string, string>,
): LegendItem[] => {
  return multipleSeries.map((series) => ({
    key: series.seriesKey,
    name: series.seriesName,
    color: seriesColors[series.seriesKey],
  }));
};
