import type { LegendItem } from "metabase/visualizations/echarts/cartesian/model/types";
import type { Series } from "metabase/visualizations/shared/components/RowChart/types";
import type { VisualizationSettings } from "metabase-types/api";

export const getLegendItems = <TDatum>(
  multipleSeries: Series<TDatum, unknown>[],
  seriesColors: Record<string, string>,
  settings: VisualizationSettings,
): LegendItem[] => {
  return multipleSeries.map(series => ({
    key: series.seriesKey,
    name:
      settings?.series_settings?.[series.seriesKey]?.title ?? series.seriesName,
    color: seriesColors[series.seriesKey],
  }));
};
