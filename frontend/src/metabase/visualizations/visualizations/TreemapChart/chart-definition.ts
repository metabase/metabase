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
  }),
  ...metricSetting("treemap.value", {
    getSection: () => t`Data`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Value`,
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
  }),
};

export const TREEMAP_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Treemap`,
  identifier: "treemap",
  // Placeholder until T19 ships the real icon
  iconName: "grid_2x2",
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
