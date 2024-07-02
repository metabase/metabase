import { t } from "ttag";
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
  validateChartDataSettings,
  validateDatasetRows,
  validateStacking,
} from "metabase/visualizations/lib/settings/validation";
import { SERIES_SETTING_KEY } from "metabase/visualizations/shared/settings/series";
import type {
  Visualization,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { RawSeries, SeriesSettings } from "metabase-types/api";

import { transformSeries } from "./chart-definition-legacy";

export const getCartesianChartDefinition = (
  props: Partial<Visualization>,
): Partial<Visualization> => {
  return {
    noHeader: true,
    supportsSeries: true,

    isSensible: ({ cols, rows }) => {
      return (
        rows.length > 1 &&
        cols.length >= 2 &&
        cols.filter(isDimension).length > 0 &&
        cols.filter(isMetric).length > 0
      );
    },

    isLiveResizable: series => {
      const totalRows = series.reduce((sum, s) => sum + s.data.rows.length, 0);
      return totalRows < 10;
    },

    checkRenderable(series, settings) {
      if (series.length > (this.maxMetricsSupported ?? Infinity)) {
        throw new Error(
          t`${this.uiName} chart does not support multiple series`,
        );
      }

      validateDatasetRows(series);
      validateChartDataSettings(settings);
      validateStacking(settings);
    },

    placeholderSeries: [
      {
        card: {
          display: props.identifier,
          visualization_settings: {
            "graph.metrics": ["x"],
            "graph.dimensions": ["y"],
          },
          dataset_query: { type: "query" },
          name: "x",
        },
        data: {
          rows: _.range(0, 11).map(i => [i, i]),
          cols: [
            { name: "x", base_type: "type/Integer" },
            { name: "y", base_type: "type/Integer" },
          ],
        },
      },
    ] as RawSeries,

    transformSeries,

    onDisplayUpdate: settings => {
      if (settings[SERIES_SETTING_KEY] == null) {
        return settings;
      }

      const newSettings = _.omit(settings, SERIES_SETTING_KEY);
      const newSeriesSettings: Record<string, SeriesSettings> = {};

      Object.entries(settings[SERIES_SETTING_KEY]).forEach(
        ([key, seriesSettings]) => {
          const newSingleSeriesSettings = _.omit(seriesSettings, "display");

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
