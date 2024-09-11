import { t } from "ttag";
import _ from "underscore";

import { formatValue } from "metabase/lib/formatting";
import { ChartSettingSeriesOrder } from "metabase/visualizations/components/settings/ChartSettingSeriesOrder";
import type { PieRow } from "metabase/visualizations/echarts/pie/model/types";
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
  getDefaultShowLegend,
  getDefaultSliceThreshold,
  getDefaultSortRows,
  getPieRows,
} from "metabase/visualizations/shared/settings/pie";
import { SERIES_SETTING_KEY } from "metabase/visualizations/shared/settings/series";
import { getDefaultShowTotal } from "metabase/visualizations/shared/settings/waterfall";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import { SliceNameWidget } from "./SliceNameWidget";

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
    "pie.rows": {
      section: t`Data`,
      widget: ChartSettingSeriesOrder,
      getHidden: (_rawSeries, settings) => settings["pie.dimension"] == null,
      getValue: (rawSeries, settings) => {
        return getPieRows(rawSeries, settings, (value, options) =>
          String(formatValue(value, options)),
        );
      },
      getProps: (
        _rawSeries,
        vizSettings: ComputedVisualizationSettings,
        onChange,
        _extra,
        onChangeSettings,
      ) => {
        return {
          addButtonLabel: t`Add another row`,
          searchPickerPlaceholder: t`Select a row`,
          onChangeSeriesColor: (sliceKey: string, color: string) => {
            const pieRows = vizSettings["pie.rows"];
            if (pieRows == null) {
              throw Error("Missing `pie.rows` setting");
            }

            onChange(
              pieRows.map(row => {
                if (row.key !== sliceKey) {
                  return row;
                }
                return { ...row, color, defaultColor: false };
              }),
            );
          },
          onSortEnd: (newPieRows: PieRow[]) =>
            onChangeSettings({
              "pie.sort_rows": false,
              "pie.rows": newPieRows,
            }),
        };
      },
      readDependencies: [
        "pie.dimension",
        "pie.metric",
        "pie.colors",
        "pie.sort_rows",
        "pie.slice_threshold",
      ],
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
  } as VisualizationSettingsDefinitions,
};
