import { t } from "ttag";

import { getSankeyChartColumns } from "metabase/visualizations/echarts/graph/sankey/model/dataset";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  dimensionSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import { getSankeyColumns } from "metabase/visualizations/lib/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { isDate, isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, RawSeries } from "metabase-types/api";

import { hasCyclicFlow } from "./utils/cycle-detection";

export const SETTINGS_DEFINITIONS = {
  ...columnSettings({ hidden: true }),
  ...dimensionSetting("sankey.source", {
    section: t`Data`,
    title: t`Source`,
    showColumnSetting: true,
    getDefault: ([series]: RawSeries) => getSankeyColumns(series).source,
  }),
  ...dimensionSetting("sankey.target", {
    section: t`Data`,
    title: t`Target`,
    showColumnSetting: true,
    getDefault: ([series]: RawSeries) => getSankeyColumns(series).target,
  }),
  ...metricSetting("sankey.value", {
    section: t`Data`,
    title: t`Value`,
    showColumnSetting: true,
    getDefault: ([series]: RawSeries) => getSankeyColumns(series).metric,
  }),
  "sankey.node_align": {
    section: t`Display`,
    title: t`Align`,
    widget: "select",
    default: "left",
    props: {
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
    },
  },
  "sankey.show_edge_labels": {
    section: t`Display`,
    title: t`Show edge labels`,
    widget: "toggle",
    default: false,
    inline: true,
  },
  "sankey.edge_color": {
    section: t`Display`,
    title: t`Edge color`,
    widget: "segmentedControl",
    default: "gray",
    props: {
      options: [
        { name: t`Gray`, value: "gray" },
        { name: t`Source`, value: "source" },
        { name: t`Target`, value: "target" },
      ],
    },
  },
};

export const SANKEY_CHART_DEFINITION = {
  uiName: t`Sankey`,
  identifier: "sankey",
  iconName: "link",
  noun: t`sankey chart`,
  minSize: getMinSize("sankey"),
  defaultSize: getDefaultSize("sankey"),
  isSensible: ({ cols, rows }: DatasetData) => {
    const numDimensions = cols.filter(
      col => isDimension(col) && !isDate(col),
    ).length;
    const numMetrics = cols.filter(isMetric).length;

    return (
      rows.length >= 2 &&
      cols.length >= 3 &&
      numDimensions >= 2 &&
      numMetrics >= 1
    );
  },
  checkRenderable: (
    rawSeries: RawSeries,
    settings: ComputedVisualizationSettings,
  ) => {
    const sankeyColumns = getSankeyChartColumns(
      rawSeries[0].data.cols,
      settings,
    );
    if (!sankeyColumns) {
      throw new ChartSettingsError(t`Which columns do you want to use?`, {
        section: `Data`,
      });
    }

    if (
      hasCyclicFlow(
        rawSeries[0].data.rows,
        sankeyColumns.source.index,
        sankeyColumns.target.index,
      )
    ) {
      throw new ChartSettingsError(
        t`Sankey charts cannot contain cycles. Please check your data for circular references.`,
        { section: "Data" },
      );
    }
  },
  settings: {
    ...SETTINGS_DEFINITIONS,
  } as any as VisualizationSettingsDefinitions,
};
