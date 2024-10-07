import { t } from "ttag";
import _ from "underscore";

import { formatValue } from "metabase/lib/formatting";
import {
  ChartSettingsError,
  MinRowsError,
} from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { nestedSettings } from "metabase/visualizations/lib/settings/nested";
import {
  dimensionSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultPercentVisibility,
  getDefaultPieColumns,
  getDefaultShowLabels,
  getDefaultShowLegend,
  getDefaultShowTotal,
  getDefaultSliceThreshold,
  getDefaultSortRows,
  getPieRows,
  getPieSortRowsDimensionSetting,
} from "metabase/visualizations/shared/settings/pie";
import { SERIES_SETTING_KEY } from "metabase/visualizations/shared/settings/series";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { RawSeries, Series } from "metabase-types/api";

import { DimensionsWidget } from "./DimensionsWidget";
import { SliceNameWidget } from "./SliceNameWidget";

export const PIE_CHART_DEFINITION: VisualizationDefinition = {
  uiName: t`Pie`,
  identifier: "pie",
  iconName: "pie",
  minSize: getMinSize("pie"),
  defaultSize: getDefaultSize("pie"),
  isSensible: ({ cols, rows }) => {
    const numDimensions = cols.filter(isDimension).length;
    const numMetrics = cols.filter(isMetric).length;

    return (
      rows.length >= 2 &&
      cols.length >= 2 &&
      numDimensions >= 1 &&
      numMetrics >= 1
    );
  },
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
    ...metricSetting("pie.metric", {
      section: t`Data`,
      title: t`Measure`,
      showColumnSetting: true,
      getDefault: (rawSeries: Series) => getDefaultPieColumns(rawSeries).metric,
    }),
    ...columnSettings({ hidden: true }),
    ...dimensionSetting("pie.dimension", {
      hidden: true,
      title: t`Dimension`,
      showColumnSetting: true,
      getDefault: (rawSeries: Series) =>
        getDefaultPieColumns(rawSeries).dimension,
    }),
    "pie.rows": {
      hidden: true,
      getValue: (rawSeries, settings) => {
        return getPieRows(rawSeries, settings, (value, options) =>
          String(formatValue(value, options)),
        );
      },
      readDependencies: [
        "pie.dimension",
        "pie.metric",
        "pie.colors",
        "pie.sort_rows",
        "pie.slice_threshold",
      ],
      writeDependencies: ["pie.sort_rows_dimension"],
    },
    "pie.sort_rows_dimension": {
      getValue: (_series, settings) => getPieSortRowsDimensionSetting(settings),
      // This read dependency is set so that "pie.sort_rows" is computed *before* this value, ensuring that
      // that it uses the stored value if one exists. This is needed to check if the dimension has actually changed
      readDependencies: ["pie.sort_rows", "pie.dimension"],
    },
    "pie.sort_rows": {
      hidden: true,
      getDefault: getDefaultSortRows,
    },
    ...nestedSettings(SERIES_SETTING_KEY, {
      widget: SliceNameWidget,
      getHidden: (
        [{ card }]: RawSeries,
        _settings: ComputedVisualizationSettings,
        { isDashboard }: { isDashboard: boolean },
      ) => !isDashboard || card?.display === "waterfall",
      getSection: (
        _series: RawSeries,
        _settings: ComputedVisualizationSettings,
        { isDashboard }: { isDashboard: boolean },
      ) => (isDashboard ? t`Display` : t`Style`),
      marginBottom: "0",
      getProps: (
        _series: any,
        vizSettings: ComputedVisualizationSettings,
        _onChange: any,
        _extra: any,
        onChangeSettings: (newSettings: ComputedVisualizationSettings) => void,
      ) => {
        const pieRows = vizSettings["pie.rows"];
        if (pieRows == null) {
          return { pieRows: [], updateRowName: () => null };
        }

        return {
          pieRows,
          updateRowName: (newName: string, key: string | number) => {
            onChangeSettings({
              "pie.rows": pieRows.map(row => {
                if (row.key !== key) {
                  return row;
                }
                return { ...row, name: newName };
              }),
            });
          },
        };
      },
      readDependencies: ["pie.rows"],
    } as any), // any type cast needed to avoid type error from confusion with destructured object params in `nestedSettings`

    "pie._dimensions_widget": {
      section: t`Data`,
      widget: DimensionsWidget,
      getProps: (
        rawSeries: RawSeries,
        settings: ComputedVisualizationSettings,
        _onChange: any,
        _extra: any,
        onChangeSettings: (newSettings: ComputedVisualizationSettings) => void,
      ) => ({
        rawSeries,
        settings,
        onChangeSettings,
      }),
      readDependencies: ["pie.dimension", "pie.rows"],
    },
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
      marginBottom: "1rem",
    },
    "pie.show_labels": {
      section: t`Display`,
      title: t`Show labels`,
      widget: "toggle",
      getDefault: (_rawSeries, settings) => getDefaultShowLabels(settings),
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
  } as VisualizationSettingsDefinitions,
};
