import { useMemo } from "react";
import { t } from "ttag";
import type { VisualizationProps } from "metabase/visualizations/types";

import { measureTextWidth } from "metabase/lib/measure-text";
import { formatValue } from "metabase/lib/formatting/value";
import { color } from "metabase/lib/colors";
import {
  GRAPH_AXIS_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_DATA_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
  GRAPH_TREND_SETTINGS,
  LINE_SETTINGS,
} from "metabase/visualizations/lib/settings/graph";
import { GRAPH_GOAL_SETTINGS } from "metabase/visualizations/lib/settings/goal";
import LineAreaBarChart from "metabase/visualizations/components/LineAreaBarChart";
import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";

Object.assign(ComboChartPlayground, {
  uiName: "Combo EChart",
  identifier: "combo-echart",
  iconName: "bolt",
  supportsSeries: true,
  settings: {
    ...LINE_SETTINGS,
    "stackable.stack_type": {
      section: t`Display`,
      title: t`Stacking`,
      widget: "radio",
      props: {
        options: [
          { name: t`Don't stack`, value: null },
          { name: t`Stack`, value: "stacked" },
          { name: t`Stack - 100%`, value: "normalized" },
        ],
      },
      getDefault: ([{ card, data }]: any, settings: any) => {
        // legacy setting and default for D-M-M+ charts
        if (settings["stackable.stacked"]) {
          return settings["stackable.stacked"];
        }

        return null;
      },
      readDependencies: ["graph.metrics", "graph.dimensions", "series"],
    },
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_TREND_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_DISPLAY_VALUES_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  },
  transformSeries: LineAreaBarChart.transformSeries,
});

export function ComboChartPlayground({
  width,
  height,
  fontFamily,
  rawSeries,
  settings,
}: VisualizationProps) {
  const renderingContext = useMemo(
    () => ({
      fontFamily,
      getColor: color,
      formatValue,
      measureText: measureTextWidth,
    }),
    [fontFamily],
  );

  const chartModel = useMemo(
    () => getCartesianChartModel(rawSeries, settings),
    [rawSeries, settings],
  );

  const option = useMemo(
    () =>
      getCartesianChartOption(chartModel, settings, renderingContext as any),
    [chartModel, settings, renderingContext],
  );

  if (width == null || height == null) {
    return null;
  }

  return <EChartsRenderer width={width} height={height} option={option} />;
}
