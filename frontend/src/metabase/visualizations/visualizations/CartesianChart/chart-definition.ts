import _ from "underscore";

import { GRAPH_GOAL_SETTINGS } from "metabase/visualizations/lib/settings/goal";
import {
  GRAPH_AXIS_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_DATA_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
  GRAPH_TREND_SETTINGS,
  LEGEND_SETTINGS,
  LINE_SETTINGS,
  STACKABLE_SETTINGS,
  TOOLTIP_SETTINGS,
} from "metabase/visualizations/lib/settings/graph";
import {
  validateBreakoutSeriesCount,
  validateChartDataSettings,
  validateDatasetRows,
  validateStacking,
} from "metabase/visualizations/lib/settings/validation";
import { SERIES_SETTING_KEY } from "metabase/visualizations/shared/settings/series";
import type {
  Visualization,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { isDate, isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { VisualizationSettings } from "metabase-types/api";

import { transformSeries } from "./chart-definition-legacy";

export const getCartesianChartDefinition = (
  props: Partial<Visualization>,
): Partial<Visualization> => {
  return {
    noHeader: true,
    supportsVisualizer: true,

    getSensibility: (data) => {
      const { cols, rows } = data;
      const rowCount = rows.length;
      const colCount = cols.length;
      const dimensionCount = cols.filter(isDimension).length;
      const metricCount = cols.filter(isMetric).length;
      const hasDateDimension = cols.some(
        (col) => isDimension(col) && isDate(col),
      );

      if (
        rowCount <= 1 ||
        colCount < 2 ||
        dimensionCount < 1 ||
        metricCount < 1
      ) {
        return "nonsensible";
      }
      if (hasDateDimension || dimensionCount >= 1) {
        return "recommended";
      }
      return "nonsensible";
    },

    isLiveResizable: (series) => {
      const totalRows = series.reduce((sum, s) => sum + s.data.rows.length, 0);
      return totalRows < 10;
    },

    checkRenderable(series, settings) {
      validateDatasetRows(series);
      validateBreakoutSeriesCount(series, settings);
      validateChartDataSettings(settings);
      validateStacking(settings);
    },

    hasEmptyState: true,

    transformSeries,

    onDisplayUpdate: (settings) => {
      if (settings[SERIES_SETTING_KEY] == null) {
        return settings;
      }

      const newSettings = _.omit(settings, SERIES_SETTING_KEY);
      const newSeriesSettings: VisualizationSettings["series_settings"] = {};

      Object.entries(settings[SERIES_SETTING_KEY]).forEach(
        ([key, seriesSettings]) => {
          const newSingleSeriesSettings = seriesSettings
            ? _.omit(seriesSettings, "display")
            : seriesSettings;

          if (!_.isEmpty(newSingleSeriesSettings)) {
            newSeriesSettings[key] = newSingleSeriesSettings;
          }
        },
      );

      if (!_.isEmpty(newSeriesSettings)) {
        newSettings[SERIES_SETTING_KEY] = newSeriesSettings;
      }

      return newSettings;
    },

    ...props,
  };
};

export const COMBO_CHARTS_SETTINGS_DEFINITIONS = {
  ...STACKABLE_SETTINGS,
  ...LINE_SETTINGS,
  ...GRAPH_GOAL_SETTINGS,
  ...GRAPH_TREND_SETTINGS,
  ...GRAPH_COLORS_SETTINGS,
  ...GRAPH_AXIS_SETTINGS,
  ...GRAPH_DISPLAY_VALUES_SETTINGS,
  ...GRAPH_DATA_SETTINGS,
  ...TOOLTIP_SETTINGS,
  ...LEGEND_SETTINGS,
} as any as VisualizationSettingsDefinitions;
