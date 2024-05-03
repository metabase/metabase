import _ from "underscore";

import { getObjectKeys } from "metabase/lib/objects";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import type { SeriesModel, StackModel } from "./types";

export const getStackModels = (
  rawSeries: RawSeries,
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
): StackModel[] => {
  if (!settings["stackable.stack_type"]) {
    return [];
  }

  const isComboChart = rawSeries[0].card.display === "combo";
  if (!isComboChart) {
    return [
      {
        display: settings["stackable.stack_display"],
        seriesKeys: seriesModels.map(seriesModel => seriesModel.dataKey),
      },
    ];
  }

  const seriesModelsByDisplay = _.groupBy(
    seriesModels,
    seriesModel =>
      settings.series(seriesModel.legacySeriesSettingsObjectKey).display,
  );

  return getObjectKeys(seriesModelsByDisplay)
    .filter(display => display === "bar" || display === "area")
    .map(display => {
      return {
        display: display as "bar" | "area", // Ensured by filtering above
        seriesKeys: seriesModelsByDisplay[display].map(
          seriesModel => seriesModel.dataKey,
        ),
      };
    });
};
