import { getColorsForValues } from "metabase/ui/colors/charts";
import type { VisualizationSettings } from "metabase-types/api";

import { getChartColor } from "../../lib/color-name";
import type { Series } from "../components/RowChart/types";

export const getSeriesColors = <TDatum, TSeriesInfo>(
  settings: VisualizationSettings,
  series: Series<TDatum, TSeriesInfo>[],
): Record<string, string> => {
  const settingsColorMapping = Object.entries(
    settings.series_settings ?? {},
  ).reduce(
    (mapping, [seriesName, seriesSettings]) => {
      if (typeof seriesSettings?.color === "string") {
        mapping[seriesName] = getChartColor(
          seriesSettings.color,
          seriesSettings.color_name,
        );
      }

      return mapping;
    },
    // Unjustified type cast. FIXME
    {} as Record<string, string>,
  );

  return getColorsForValues(
    series.map((series) => series.seriesKey),
    settingsColorMapping,
  );
};
