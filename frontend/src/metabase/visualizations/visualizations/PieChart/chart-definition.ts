import { t } from "ttag";
import _ from "underscore";

import { formatValue } from "metabase/lib/formatting";
import {
  ChartSettingsError,
  MinRowsError,
} from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  dimensionSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import {
  getColors,
  getDefaultPercentVisibility,
  getDefaultShowLegend,
  getDefaultSliceThreshold,
} from "metabase/visualizations/shared/settings/pie";
import { getDefaultShowTotal } from "metabase/visualizations/shared/settings/waterfall";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationDefinition } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

export const PIE_CHART_DEFINITION: VisualizationDefinition = {
  uiName: t`Pie`,
  identifier: "pie",
  iconName: "pie",
  minSize: getMinSize("pie"),
  defaultSize: getDefaultSize("pie"),
  isSensible: ({ cols }) => cols.length === 2,
  checkRenderable: (
    [
      {
        data: { rows },
      },
    ],
    settings,
  ) => {
    // This prevents showing "Which columns do you want to use" when
    // the piechart is displayed with no results in the dashboard
    if (rows.length < 1) {
      throw new MinRowsError(1, 0);
    }
    if (!settings["pie.dimension"] || !settings["pie.metric"]) {
      throw new ChartSettingsError(t`Which columns do you want to use?`, {
        section: `Data`,
      });
    }
  },
  placeholderSeries: [
    {
      card: {
        display: "pie",
        visualization_settings: { "pie.show_legend": false },
        dataset_query: { type: "query" },
      },
      data: {
        rows: [
          ["Doohickey", 3976],
          ["Gadget", 4939],
          ["Gizmo", 4784],
          ["Widget", 5061],
        ],
        cols: [
          { name: "Category", base_type: "type/Category" },
          { name: "Count", base_type: "type/Integer" },
        ],
      },
    },
  ] as RawSeries,
  settings: {
    ...columnSettings({ hidden: true }),
    ...dimensionSetting("pie.dimension", {
      section: t`Data`,
      title: t`Dimension`,
      showColumnSetting: true,
    }),
    ...metricSetting("pie.metric", {
      section: t`Data`,
      title: t`Measure`,
      showColumnSetting: true,
    }),
    "pie.show_legend": {
      section: t`Display`,
      title: t`Show legend`,
      widget: "toggle",
      getDefault: getDefaultShowLegend,
      inline: true,
      marginBottom: "1rem",
    },
    "pie.show_total": {
      section: t`Display`,
      title: t`Show total`,
      widget: "toggle",
      getDefault: getDefaultShowTotal,
      inline: true,
    },
    "pie.percent_visibility": {
      section: t`Display`,
      title: t`Show percentages`,
      widget: "radio",
      getDefault: getDefaultPercentVisibility,
      props: {
        options: [
          { name: t`Off`, value: "off" },
          { name: t`In legend`, value: "legend" },
          { name: t`On the chart`, value: "inside" },
          { name: t`Both`, value: "both" },
        ],
      },
    },
    "pie.decimal_places": {
      section: t`Display`,
      title: t`Number of decimal places`,
      widget: "number",
      props: {
        placeholder: t`Auto`,
        options: { isInteger: true, isNonNegative: true },
      },
      getHidden: (_, settings) =>
        settings["pie.percent_visibility"] == null ||
        settings["pie.percent_visibility"] === "off",
      readDependencies: ["pie.percent_visibility"],
    },
    "pie.slice_threshold": {
      section: t`Display`,
      title: t`Minimum slice percentage`,
      widget: "number",
      getDefault: getDefaultSliceThreshold,
    },
    "pie.colors": {
      section: t`Display`,
      title: t`Colors`,
      widget: "colors",
      getValue: getColors,
      getProps: (series, settings) => ({
        seriesValues: settings["pie._dimensionValues"] || [],
        seriesTitles: settings["pie._dimensionTitles"] || [],
      }),
      getDisabled: (series, settings) => !settings["pie._dimensionValues"],
    },
    "pie._dimensionIndex": {
      getValue: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => _.findIndex(cols, col => col.name === settings["pie.dimension"]),
      readDependencies: ["pie.dimension"],
    },
    "pie._dimensionValues": {
      getValue: (
        [
          {
            data: { rows },
          },
        ],
        settings,
      ) => {
        const dimensionIndex = settings["pie._dimensionIndex"];
        if (dimensionIndex == null || dimensionIndex < 0) {
          return null;
        }

        return rows.map(row => String(row[dimensionIndex]));
      },
      readDependencies: ["pie._dimensionIndex"],
    },
    "pie._dimensionTitles": {
      getValue: (
        [
          {
            data: { rows, cols },
          },
        ],
        settings,
      ) => {
        const dimensionIndex = settings["pie._dimensionIndex"];
        if (dimensionIndex == null || dimensionIndex < 0) {
          return null;
        }

        return rows.map(row =>
          formatValue(
            row[dimensionIndex],
            settings.column(cols[dimensionIndex]),
          ),
        );
      },
      readDependencies: ["pie._dimensionIndex"],
    },
  },
};
