import { VisualizationSettings } from "metabase-types/api";
import { Series } from "metabase/visualizations/shared/components/RowChart/types";

export const getLegendItems = <TDatum>(
  multipleSeries: Series<TDatum, unknown>[],
  seriesColors: Record<string, string>,
  settings: VisualizationSettings,
  rawSeries: any[],
) => {
  const colors = multipleSeries.map(single => seriesColors[single.seriesKey]);
  const seriesSettings =
    settings.series && rawSeries.map((single: any) => settings.series(single));

  if (!seriesSettings) {
    return {
      colors,
      labels: multipleSeries.map(single => single.seriesName),
    };
  }

  const orderedRawSeries = multipleSeries.map(series =>
    rawSeries.find(rawSeries => rawSeries.card.name === series.seriesName),
  );
  const orderedTitles = orderedRawSeries.map(
    series => settings.series(series)?.title,
  );

  return {
    labels: orderedTitles,
    colors: multipleSeries.map(single => seriesColors[single.seriesKey]),
  };
};
