import type { LegendItem, Series } from "metabase/viz-core";

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
