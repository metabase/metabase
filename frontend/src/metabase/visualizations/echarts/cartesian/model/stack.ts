import _ from "underscore";

import { getObjectKeys } from "metabase/lib/objects";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import type { SeriesModel, StackModel } from "./types";

export const getStackModels = (
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
): StackModel[] => {
  if (!settings["stackable.stack_type"]) {
    return [];
  }

  const seriesModelsByDisplay = _.groupBy(
    seriesModels,
    seriesModel =>
      settings.series(seriesModel.legacySeriesSettingsObjectKey).display,
  );

  return getObjectKeys(seriesModelsByDisplay)
    .filter(display => display === "bar" || display === "area")
    .map(display => {
      const stackSeriesModels = seriesModelsByDisplay[display];

      let axis: "left" | "right";
      if (settings["stackable.stack_type"] === "normalized") {
        axis = "left";
      } else {
        axis = stackSeriesModels.every(
          seriesModel =>
            settings.series(seriesModel.legacySeriesSettingsObjectKey)?.axis ===
            "right",
        )
          ? "right"
          : "left";
      }

      return {
        axis,
        display: display as "bar" | "area", // Ensured by filtering above
        seriesKeys: seriesModelsByDisplay[display].map(
          seriesModel => seriesModel.dataKey,
        ),
      };
    });
};
