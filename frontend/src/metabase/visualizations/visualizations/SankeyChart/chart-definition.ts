import { t } from "ttag";

import { getSankeyChartColumns } from "metabase/visualizations/echarts/graph/sankey/model/dataset";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  dimensionSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import { findSensibleSankeyColumns } from "metabase/visualizations/lib/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { isDate, isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, RawSeries, Series } from "metabase-types/api";

import { hasCyclicFlow } from "./utils/cycle-detection";

const MAX_SANKEY_NODES = 150;

export const SETTINGS_DEFINITIONS = {
  ...columnSettings({ hidden: true }),
  ...dimensionSetting("sankey.source", {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    section: t`Data`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Source`,
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([series]: RawSeries) =>
      findSensibleSankeyColumns(series.data)?.source,
  }),
  ...dimensionSetting("sankey.target", {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    section: t`Data`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Target`,
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([series]: RawSeries) =>
      findSensibleSankeyColumns(series.data)?.target,
  }),
  ...metricSetting("sankey.value", {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    section: t`Data`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Value`,
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([series]: RawSeries) =>
      findSensibleSankeyColumns(series.data)?.metric,
  }),
  "sankey.node_align": {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    section: t`Display`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Align`,
    widget: "select",
    default: "left",
    props: {
      options: [
        {
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          name: t`Left`,
          value: "left",
        },
        {
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          name: t`Right`,
          value: "right",
        },
        {
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          name: t`Justify`,
          value: "justify",
        },
      ],
    },
  },
  "sankey.show_edge_labels": {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    section: t`Display`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Show edge labels`,
    widget: "toggle",
    default: false,
    inline: true,
  },
  "sankey.label_value_formatting": {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    section: t`Display`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Auto formatting`,
    widget: "segmentedControl",
    props: {
      options: [
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        { name: t`Auto`, value: "auto" },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        { name: t`Compact`, value: "compact" },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        { name: t`Full`, value: "full" },
      ],
    },
    getHidden: (
      _series: Series,
      vizSettings: ComputedVisualizationSettings,
    ) => {
      return !vizSettings["sankey.show_edge_labels"];
    },
    default: "auto",
  },
  "sankey.edge_color": {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    section: t`Display`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Edge color`,
    widget: "segmentedControl",
    default: "source",
    props: {
      options: [
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        { name: t`Gray`, value: "gray" },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        { name: t`Source`, value: "source" },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        { name: t`Target`, value: "target" },
      ],
    },
  },
};

export const SANKEY_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Sankey`,
  identifier: "sankey",
  iconName: "sankey",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`sankey chart`,
  minSize: getMinSize("sankey"),
  disableVisualizer: true,
  defaultSize: getDefaultSize("sankey"),
  isSensible: (data: DatasetData) => {
    const { cols, rows } = data;
    const numDimensions = cols.filter(
      (col) => isDimension(col) && !isDate(col),
    ).length;
    const numMetrics = cols.filter(isMetric).length;

    const hasEnoughRows = rows.length >= 1;
    const hasSuitableColumnTypes =
      cols.length >= 3 && numDimensions >= 2 && numMetrics >= 1;

    if (!hasSuitableColumnTypes || !hasEnoughRows) {
      return false;
    }

    const suitableColumns = findSensibleSankeyColumns(data);
    if (!suitableColumns) {
      return false;
    }

    const sankeyColumns = getSankeyChartColumns(cols, {
      "sankey.source": suitableColumns.source,
      "sankey.target": suitableColumns.target,
      "sankey.value": suitableColumns.metric,
    });
    if (!sankeyColumns) {
      return false;
    }

    return !hasCyclicFlow(
      data.rows,
      sankeyColumns.source.index,
      sankeyColumns.target.index,
    );
  },
  checkRenderable: (
    rawSeries: RawSeries,
    settings: ComputedVisualizationSettings,
  ) => {
    const { rows, cols } = rawSeries[0].data;

    if (rows.length === 0) {
      return;
    }
    const sankeyColumns = getSankeyChartColumns(cols, settings);
    if (!sankeyColumns) {
      throw new ChartSettingsError(t`Which columns do you want to use?`, {
        section: `Data`,
      });
    }

    if (sankeyColumns.source.index === sankeyColumns.target.index) {
      throw new ChartSettingsError(
        t`Select two different columns for source and target to create a flow.`,
        { section: "Data" },
      );
    }

    if (
      hasCyclicFlow(
        rows,
        sankeyColumns.source.index,
        sankeyColumns.target.index,
      )
    ) {
      throw new ChartSettingsError(
        t`Selected columns create circular flows. Try picking different columns that flow in one direction.`,
        { section: "Data" },
      );
    }

    const nodesCount = new Set(
      rows.flatMap((row) => [
        row[sankeyColumns.source.index],
        row[sankeyColumns.target.index],
      ]),
    ).size;

    if (nodesCount > MAX_SANKEY_NODES) {
      throw new ChartSettingsError(
        t`Sankey chart doesn't support more than ${MAX_SANKEY_NODES} unique nodes.`,
      );
    }
  },
  hasEmptyState: true,
  settings: {
    ...SETTINGS_DEFINITIONS,
  } as any as VisualizationSettingsDefinitions,
};
