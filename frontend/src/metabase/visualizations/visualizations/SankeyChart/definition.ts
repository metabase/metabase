import { t } from "ttag";

import {
  ChartSettingsError,
  type ComputedVisualizationSettings,
  type VisualizationDefinition,
  type VisualizationSettingsDefinitions,
  columnSettings,
  dimensionSetting,
  findSensibleSankeyColumns,
  getDefaultSize,
  getMinSize,
  getSankeyChartColumns,
  metricSetting,
} from "metabase/viz-core";
import { isDate, isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, RawSeries } from "metabase-types/api";

import { hasCyclicFlow } from "./utils/cycle-detection";

const MAX_SANKEY_NODES = 150;

/**
 * The most breakout values a Sankey shows in one chart by default. Past a
 * handful, the colors that tell them apart get hard to tell apart, more so
 * as thin slices of a flow.
 */
const MAX_UNSTACKED_BREAKOUTS = 4;

/**
 * The most flows a Sankey shows in one chart by default. Each row is a flow:
 * an edge, for a breakout value.
 */
const MAX_UNSTACKED_FLOWS = 50;

/** How many values the breakout column has, 0 without one. */
const getBreakoutCount = (
  { cols, rows }: DatasetData,
  column: string | null | undefined,
): number => {
  const index = cols.findIndex((col) => col.name === column);
  return index >= 0 ? new Set(rows.map((row) => row[index])).size : 0;
};

/**
 * Whether a broken-out Sankey is easier to read as one per breakout value:
 * with more values than colors tell apart, or more flows than fit.
 */
const isBusyBreakout = (
  data: DatasetData,
  breakout: string | null | undefined,
): boolean => {
  const breakoutCount = getBreakoutCount(data, breakout);
  return (
    breakoutCount > 1 &&
    (breakoutCount > MAX_UNSTACKED_BREAKOUTS ||
      data.rows.length > MAX_UNSTACKED_FLOWS)
  );
};

export const SETTINGS_DEFINITIONS: VisualizationSettingsDefinitions = {
  ...columnSettings({ getHidden: () => true }),
  ...dimensionSetting("sankey.source", {
    getSection: () => t`Data`,
    get title() {
      return t`Source`;
    },
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([series]) =>
      findSensibleSankeyColumns(series.data, series.json_query)?.source,
  }),
  ...dimensionSetting("sankey.target", {
    getSection: () => t`Data`,
    get title() {
      return t`Target`;
    },
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([series]) =>
      findSensibleSankeyColumns(series.data, series.json_query)?.target,
  }),
  ...metricSetting("sankey.value", {
    getSection: () => t`Data`,
    get title() {
      return t`Value`;
    },
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([series]) =>
      findSensibleSankeyColumns(series.data, series.json_query)?.metric,
  }),
  "sankey.node_align": {
    getSection: () => t`Display`,
    get title() {
      return t`Align`;
    },
    widget: "select",
    getDefault: () => "left",
    getProps: () => ({
      options: [
        {
          name: t`Left`,
          value: "left",
        },
        {
          name: t`Right`,
          value: "right",
        },
        {
          name: t`Justify`,
          value: "justify",
        },
      ],
    }),
  },
  "sankey.show_edge_labels": {
    getSection: () => t`Display`,
    get title() {
      return t`Show edge labels`;
    },
    widget: "toggle",
    getDefault: () => false,
    inline: true,
  },
  "sankey.label_value_formatting": {
    getSection: () => t`Display`,
    get title() {
      return t`Auto formatting`;
    },
    widget: "segmentedControl",
    getProps: () => ({
      options: [
        { name: t`Auto`, value: "auto" },
        { name: t`Compact`, value: "compact" },
        { name: t`Full`, value: "full" },
      ],
    }),
    getHidden: (_series, vizSettings) => {
      return !vizSettings["sankey.show_edge_labels"];
    },
    getDefault: () => "auto",
  },
  "sankey.edge_color": {
    getSection: () => t`Display`,
    get title() {
      return t`Edge color`;
    },
    widget: "segmentedControl",
    getDefault: () => "source",
    getProps: () => ({
      options: [
        { name: t`Gray`, value: "gray" },
        { name: t`Source`, value: "source" },
        { name: t`Target`, value: "target" },
      ],
    }),
  },
  // No widgets yet; set by product analytics paths
  "sankey.breakout": {
    getDefault: () => undefined,
  },
  "sankey.breakout_colors": {
    getDefault: () => ({}),
  },
  // A Sankey per breakout value, one above another. Unstacked, the values
  // share each edge and only color tells them apart, which stays readable
  // for a few values and not too many flows.
  "sankey.split_panels": {
    getSection: () => t`Display`,
    get title() {
      return t`Stack series`;
    },
    widget: "toggle",
    inline: true,
    getDefault: ([{ data }], vizSettings) =>
      isBusyBreakout(data, vizSettings["sankey.breakout"]),
    getHidden: ([{ data }], vizSettings) =>
      getBreakoutCount(data, vizSettings["sankey.breakout"]) < 2,
    readDependencies: ["sankey.breakout"],
  },
  "product_analytics.paths": {
    getDefault: () => false,
  },
};

export const SANKEY_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Sankey`,
  identifier: "sankey",
  iconName: "sankey",
  get noun() {
    return t`sankey chart`;
  },
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
  },
};
