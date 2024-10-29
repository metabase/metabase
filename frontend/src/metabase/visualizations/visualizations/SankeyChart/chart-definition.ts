import { t } from "ttag";

import { getSankeyChartColumns } from "metabase/visualizations/echarts/graph/sankey/model/dataset";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  dimensionSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

export const SETTINGS_DEFINITIONS = {
  ...columnSettings({ hidden: true }),
  ...dimensionSetting("sankey.source", {
    section: t`Data`,
    title: t`Source`,
    showColumnSetting: true,
  }),
  ...dimensionSetting("sankey.target", {
    section: t`Data`,
    title: t`Target`,
    showColumnSetting: true,
  }),
  ...metricSetting("sankey.value", {
    section: t`Data`,
    title: t`Value`,
    showColumnSetting: true,
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
};

export const SANKEY_CHART_DEFINITION = {
  uiName: t`Sankey`,
  identifier: "sankey",
  iconName: "link",
  noun: t`sankey chart`,
  minSize: getMinSize("sankey"),
  defaultSize: getDefaultSize("sankey"),
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
  },
  settings: {
    ...SETTINGS_DEFINITIONS,
  } as any as VisualizationSettingsDefinitions,
};
