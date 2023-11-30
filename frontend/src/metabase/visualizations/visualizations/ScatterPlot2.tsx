import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";
import { measureTextWidth } from "metabase/lib/measure-text";
import { computeStaticComboChartSettings } from "metabase/static-viz/components/ComboChart/settings";
import { EChartsRenderer } from "../components/EChartsRenderer";
import { getCartesianChartModel } from "../echarts/cartesian/model";
import { GRAPH_GOAL_SETTINGS } from "../lib/settings/goal";
import {
  GRAPH_AXIS_SETTINGS,
  GRAPH_BUBBLE_SETTINGS,
  GRAPH_DATA_SETTINGS,
  GRAPH_TREND_SETTINGS,
  GRAPH_COLORS_SETTINGS,
} from "../lib/settings/graph";
import type { RenderingContext, VisualizationProps } from "../types";
import { getCartesianChartOption } from "../echarts/cartesian/option";

Object.assign(ScatterPlot2, {
  uiName: "Scatter 2",
  identifier: "scatter2",
  iconName: "bubble",
  settings: {
    ...GRAPH_BUBBLE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_TREND_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  },
});

// For testing/debugging only, do not merge to master
export function ScatterPlot2(props: VisualizationProps) {
  const renderingContext: RenderingContext = {
    getColor: color,
    formatValue: (value, options) => formatValue(value, options) as string,
    measureText: measureTextWidth,
    fontFamily: props.fontFamily,
  };
  const computedVizSettings = computeStaticComboChartSettings(
    props.rawSeries,
    {},
    renderingContext,
  );

  const chartModel = getCartesianChartModel(
    props.rawSeries,
    computedVizSettings,
    renderingContext,
  );
  const option = getCartesianChartOption(
    chartModel,
    computedVizSettings,
    renderingContext,
  );

  return (
    <EChartsRenderer
      width={props.width}
      height={props.height}
      option={option}
    />
  );
}
