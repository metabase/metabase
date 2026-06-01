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
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Grouping`,
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
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Sub-grouping`,
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
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Value`,
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
};

export const TREEMAP_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Treemap`,
  identifier: "treemap",
  iconName: "treemap",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`treemap chart`,
  minSize: { width: 4, height: 4 },
  defaultSize: { width: 6, height: 6 },
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
