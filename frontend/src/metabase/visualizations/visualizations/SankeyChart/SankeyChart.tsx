import { t } from "ttag";
import _ from "underscore";

import { getSankeyLayout } from "metabase/visualizations/echarts/graph/layout";
import { getSankeyChartModel } from "metabase/visualizations/echarts/graph/model";
import { getSankeyChartOption } from "metabase/visualizations/echarts/graph/sankey/option";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
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
  VisualizationProps,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";

import { SankeyChartRenderer } from "./SankeyChart.styled";

const SETTINGS_DEFINITIONS = {
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
};

export const SankeyChart = ({
  rawSeries,
  settings,
  fontFamily,
}: VisualizationProps) => {
  const renderingContext = useBrowserRenderingContext({ fontFamily });
  const model = getSankeyChartModel(rawSeries, settings, renderingContext);
  const layout = getSankeyLayout(model, renderingContext);
  const option = getSankeyChartOption(model, layout, renderingContext);

  return <SankeyChartRenderer option={option} />;
};

Object.assign(SankeyChart, {
  uiName: t`Sankey`,
  identifier: "sankey",
  iconName: "link",
  noun: t`sankey chart`,
  minSize: getMinSize("combo"),
  defaultSize: getDefaultSize("combo"),
  settings: {
    ...SETTINGS_DEFINITIONS,
  } as any as VisualizationSettingsDefinitions,
});
