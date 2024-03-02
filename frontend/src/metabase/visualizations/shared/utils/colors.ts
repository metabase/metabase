import { getColorsForValues } from "metabase/lib/colors/charts";
import type { VisualizationSettings } from "metabase-types/api";

import type { Series } from "../components/RowChart/types";

export const getSeriesColors = <TDatum, TSeriesInfo>(
  settings: VisualizationSettings,
  series: Series<TDatum, TSeriesInfo>[],
): Record<string, string> => {
  const settingsColorMapping = Object.entries(
    settings.series_settings ?? {},
  ).reduce((mapping, [seriesName, seriesSettings]) => {
    if (typeof seriesSettings.color === "string") {
      mapping[seriesName] = seriesSettings.color;
    }

    return mapping;
  }, {} as Record<string, string>);

  return getColorsForValues(
    series.map(series => series.seriesKey),
    settingsColorMapping,
  );
};
