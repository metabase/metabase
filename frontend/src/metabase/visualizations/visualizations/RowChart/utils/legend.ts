import type { Series } from "metabase/visualizations/shared/components/RowChart/types";
import type { VisualizationSettings } from "metabase-types/api";

export const getLegendItems = <TDatum>(
  multipleSeries: Series<TDatum, unknown>[],
  seriesColors: Record<string, string>,
  settings: VisualizationSettings,
) => {
  const orderedTitles = multipleSeries.map(
    series =>
      settings?.series_settings?.[series.seriesKey]?.title ?? series.seriesName,
  );

  return {
    labels: orderedTitles,
    colors: multipleSeries.map(single => seriesColors[single.seriesKey]),
  };
};
