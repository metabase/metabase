import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import {
  getRawSeries,
  getTransformedSeries,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

/**
 * This selector hydrates the visualization settings with default values for the series, column, and other settings.
 * This is used to provide a more accurate context to the LLM when changing settings.
 */
export const getVisualizationMetabotContext = createSelector(
  [getTransformedSeries, getRawSeries, getVisualizationSettings],
  (transformedSeries, rawSeries, visualizationSettings) => {
    const hydratedVisualizationSettings: ComputedVisualizationSettings = {
      ...visualizationSettings,
    };

    if (typeof hydratedVisualizationSettings.series === "function") {
      const seriesSettings: ComputedVisualizationSettings["series_settings"] =
        {};
      transformedSeries.forEach((series) => {
        seriesSettings[keyForSingleSeries(series)] =
          hydratedVisualizationSettings.series(series);
      });
      hydratedVisualizationSettings.series_settings = seriesSettings;
    }

    if (typeof hydratedVisualizationSettings.column === "function") {
      const columnSettings: ComputedVisualizationSettings["column_settings"] = {
        ...hydratedVisualizationSettings.column_settings,
      };
      rawSeries.forEach((series) => {
        series.data.cols.forEach((col) => {
          const columnSetting = hydratedVisualizationSettings.column?.(col);

          if (columnSetting) {
            // Use column name as key instead of column key because LLMs are bad with stringified json keys like `["name","column_name"]`
            columnSettings[col.name] = {
              ...columnSetting,
              // Remove unnecessary properties from column objects
              column: _.pick(columnSetting.column, [
                "name",
                "display_name",
                "effective_type",
                "base_type",
                "database_type",
                "semantic_type",
              ]),
            };
          }
        });
      });

      hydratedVisualizationSettings.column_settings = columnSettings;
    }

    return hydratedVisualizationSettings;
  },
);
