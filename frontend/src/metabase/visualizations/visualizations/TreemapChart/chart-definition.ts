import { t } from "ttag";

import { getTreemapChartColumns } from "metabase/visualizations/echarts/graph/treemap/model/data";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  dimensionSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import type {
  ComputedVisualizationSettings,
  VisualizationDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, RawSeries } from "metabase-types/api";

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
    getDefault: ([{ data }]) => {
      const firstDimension = data.cols.find(
        (col) => isDimension(col) && !isMetric(col),
      );
      return firstDimension?.name;
    },
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
    getProps: ([{ data }], vizSettings, onChange) => ({
      options: data.cols
        .filter(isDimension)
        .map((col) => ({ name: col.display_name, value: col.name })),
      columns: data.cols,
      onRemove: vizSettings["treemap.sub_grouping"]
        ? () => onChange(null as never)
        : null,
    }),
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
    // The parent labels are the top-level group header chips, which only exist
    // in a 2-level treemap — hide the setting until a sub-grouping is selected.
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
    // Parent values render inside the group header chips, so they have no effect
    // when the chips themselves are hidden — disable the toggle when parent
    // labels are off.
    getProps: (
      _series: RawSeries,
      vizSettings: ComputedVisualizationSettings,
    ) => ({
      disabled: vizSettings["treemap.show_parent_labels"] === false,
    }),
    // Parent values render in the group header chips, which only exist in a
    // 2-level treemap — hide the setting until a sub-grouping is selected.
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
    // Leaf values render as part of the leaf tile label, so they have no effect
    // when leaf labels are off — disable the toggle then.
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
    const treemapColumns = getTreemapChartColumns(cols, settings);
    if (!treemapColumns) {
      throw new ChartSettingsError(t`Which columns do you want to use?`, {
        section: "Data",
      });
    }
  },
  settings: {
    ...SETTINGS_DEFINITIONS,
  },
};
