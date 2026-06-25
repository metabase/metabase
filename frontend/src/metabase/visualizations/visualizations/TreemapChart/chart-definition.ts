import { t } from "ttag";

import { getTreemapChartColumns } from "metabase/visualizations/echarts/graph/treemap/model/data";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { formatValue } from "metabase/visualizations/lib/formatting";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { nestedSettings } from "metabase/visualizations/lib/settings/nested";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import {
  dimensionSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import { columnsAreValid } from "metabase/visualizations/lib/utils";
import { SERIES_SETTING_KEY } from "metabase/visualizations/shared/settings/series";
import { getTreemapRows } from "metabase/visualizations/shared/settings/treemap";
import type {
  ComputedVisualizationSettings,
  VisualizationDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, RawSeries, SingleSeries } from "metabase-types/api";

import {
  SliceNameWidget,
  type SliceNameWidgetProps,
} from "../PieChart/SliceNameWidget";

import { TreemapGroupsPicker } from "./TreemapGroupsPicker";

export const SETTINGS_DEFINITIONS: VisualizationSettingsDefinitions = {
  ...columnSettings({ getHidden: () => true }),
  ...dimensionSetting("treemap.grouping", {
    getSection: () => t`Data`,
    get title() {
      return t`Grouping`;
    },
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    // Remove persisted row settings when changing the grouping
    eraseDependencies: ["treemap.rows"],
    getDefault: ([{ data }]) => {
      const firstDimension = data.cols.find(
        (col) => isDimension(col) && !isMetric(col),
      );
      return firstDimension?.name;
    },
    getWrapperStyle: (
      _series: RawSeries,
      vizSettings: ComputedVisualizationSettings,
    ) =>
      vizSettings["treemap.rows"]?.some((row) => !row.hidden)
        ? { marginBottom: 0 }
        : undefined,
  }),
  "treemap._groups_widget": {
    getSection: () => t`Data`,
    widget: TreemapGroupsPicker,
    getWrapperStyle: () => ({ marginBottom: 0 }),
    getProps: (
      rawSeries: RawSeries,
      settings: ComputedVisualizationSettings,
      _onChange: unknown,
      _extra: unknown,
      onChangeSettings: (newSettings: ComputedVisualizationSettings) => void,
    ) => ({
      rawSeries,
      settings,
      onChangeSettings,
    }),
    readDependencies: ["treemap.rows"],
  },
  ...nestedSettings<
    "series_settings",
    SingleSeries,
    unknown,
    SliceNameWidgetProps
  >(SERIES_SETTING_KEY, {
    getObjectKey: keyForSingleSeries,
    widget: SliceNameWidget,
    getHidden: (_series, _settings, extra) => !extra?.isDashboard,
    getSection: (_series, _settings, extra) =>
      extra?.isDashboard ? t`Display` : t`Style`,
    getWrapperStyle: () => ({
      marginBottom: 0,
    }),
    getProps: (_series, vizSettings, _onChange, _extra, onChangeSettings) => {
      const treemapRows = vizSettings["treemap.rows"];
      if (treemapRows == null) {
        return { pieRows: [], updateRowName: () => null };
      }

      return {
        pieRows: treemapRows,
        updateRowName: (newName: string, key: string | number) => {
          onChangeSettings({
            "treemap.rows": treemapRows.map((row) => {
              if (row.key !== key) {
                return row;
              }
              return { ...row, name: newName };
            }),
          });
        },
      };
    },
    readDependencies: ["treemap.rows"],
  }),
  ...dimensionSetting("treemap.sub_grouping", {
    getSection: () => t`Data`,
    get title() {
      return t`Sub-grouping`;
    },
    showColumnSetting: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([{ data }], vizSettings) => {
      const grouping = vizSettings["treemap.grouping"];
      const value = vizSettings["treemap.value"];
      const secondDimension = data.cols.find(
        (col) =>
          isDimension(col) && col.name !== grouping && col.name !== value,
      );
      return secondDimension?.name;
    },
    isValid: ([{ card, data }]) =>
      columnsAreValid(
        [card.visualization_settings["treemap.sub_grouping"]],
        data,
        isDimension,
      ),
    getHidden: ([{ data }], vizSettings) => {
      const grouping = vizSettings["treemap.grouping"];
      const value = vizSettings["treemap.value"];
      return !data.cols.some(
        (col) =>
          isDimension(col) && col.name !== grouping && col.name !== value,
      );
    },
    getProps: ([{ data }], vizSettings, onChange) => {
      const grouping = vizSettings["treemap.grouping"];
      return {
        options: data.cols
          .filter((col) => isDimension(col) && col.name !== grouping)
          .map((col) => ({ name: col.display_name, value: col.name })),
        columns: data.cols,
        onRemove: vizSettings["treemap.sub_grouping"]
          ? () => onChange(null)
          : null,
      };
    },
    readDependencies: ["treemap.grouping", "treemap.value"],
  }),
  ...metricSetting("treemap.value", {
    getSection: () => t`Data`,
    get title() {
      return t`Value`;
    },
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([{ data }], vizSettings) => {
      const grouping = vizSettings["treemap.grouping"];
      const firstMetric = data.cols.find(
        (col) => isMetric(col) && col.name !== grouping,
      );
      return firstMetric?.name;
    },
    readDependencies: ["treemap.grouping"],
  }),
  "treemap.rows": {
    getHidden: () => true,
    getValue: (series: RawSeries, settings: ComputedVisualizationSettings) =>
      getTreemapRows(series, settings, (value, options) =>
        String(formatValue(value, options)),
      ),
    readDependencies: [
      "treemap.grouping",
      "treemap.sub_grouping",
      "treemap.value",
    ],
  },
  "treemap.show_parent_labels": {
    getSection: () => t`Display`,
    get group() {
      return t`Parent categories`;
    },
    get title() {
      return t`Show parent labels`;
    },
    widget: "toggle",
    index: 0,
    getDefault: () => true,
    inline: true,
    getHidden: (
      _series: RawSeries,
      vizSettings: ComputedVisualizationSettings,
    ) => !vizSettings["treemap.sub_grouping"],
    readDependencies: ["treemap.sub_grouping"],
  },
  "treemap.show_parent_values": {
    getSection: () => t`Display`,
    get group() {
      return t`Parent categories`;
    },
    get title() {
      return t`Show parent values`;
    },
    widget: "toggle",
    index: 1,
    getDefault: () => true,
    inline: true,
    getProps: (
      _series: RawSeries,
      vizSettings: ComputedVisualizationSettings,
    ) => ({
      disabled: vizSettings["treemap.show_parent_labels"] === false,
    }),
    getHidden: (
      _series: RawSeries,
      vizSettings: ComputedVisualizationSettings,
    ) => !vizSettings["treemap.sub_grouping"],
    readDependencies: ["treemap.sub_grouping", "treemap.show_parent_labels"],
  },
  "treemap.show_leaf_labels": {
    getSection: () => t`Display`,
    get group() {
      return t`Leaves`;
    },
    get title() {
      return t`Show leaf labels`;
    },
    widget: "toggle",
    index: 0,
    getDefault: () => true,
    inline: true,
  },
  "treemap.show_leaf_values": {
    getSection: () => t`Display`,
    get group() {
      return t`Leaves`;
    },
    get title() {
      return t`Show leaf values`;
    },
    widget: "toggle",
    index: 1,
    getDefault: () => true,
    inline: true,
    getProps: (
      _series: RawSeries,
      vizSettings: ComputedVisualizationSettings,
    ) => ({
      disabled: vizSettings["treemap.show_leaf_labels"] === false,
    }),
    readDependencies: ["treemap.show_leaf_labels"],
  },
};

export const TREEMAP_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Treemap`,
  identifier: "treemap",
  iconName: "treemap",
  get noun() {
    return t`treemap chart`;
  },
  minSize: { width: 6, height: 4 },
  defaultSize: { width: 12, height: 8 },
  disableVisualizer: true,
  hasEmptyState: true,
  isSensible: (data: DatasetData) => {
    const { cols, rows } = data;
    const numDimensions = cols.filter(isDimension).length;
    const numMetrics = cols.filter(isMetric).length;
    return rows.length >= 1 && numDimensions >= 1 && numMetrics >= 1;
  },
  checkRenderable: (
    rawSeries: RawSeries,
    settings: ComputedVisualizationSettings,
  ) => {
    const { rows, cols } = rawSeries[0].data;
    if (rows.length === 0) {
      return;
    }

    const hasPotentialMetricColumn = cols.some(
      (col) => isMetric(col) && col.name !== settings["treemap.grouping"],
    );
    if (!hasPotentialMetricColumn) {
      throw new ChartSettingsError(
        t`Add at least one metric column to use as the value.`,
        {
          section: "Data",
        },
      );
    }

    const treemapColumns = getTreemapChartColumns(cols, settings);
    if (!treemapColumns) {
      throw new ChartSettingsError(t`Which columns do you want to use?`, {
        section: "Data",
      });
    }
  },
  settings: SETTINGS_DEFINITIONS,
};
