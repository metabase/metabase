import type { SankeySeriesOption } from "echarts/charts";
import type { EChartsCoreOption } from "echarts/core";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { SANKEY_CHART_STYLE } from "../constants/style";
import type { SankeyChartLayout } from "../layout/types";
import type { SankeyChartModel } from "../model/types";

export const getSankeyChartOption = (
  chartModel: SankeyChartModel,
  layout: SankeyChartLayout,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): EChartsCoreOption => {
  const { data, formatters } = chartModel;
  const echartsData = data.nodes.map(node => ({
    name: formatters.node(node.value),
  }));
  const links = data.links.map(link => ({
    source: formatters.node(link.source),
    target: formatters.node(link.target),
    value: typeof link.value === "number" ? link.value : undefined,
  }));

  const series: SankeySeriesOption = {
    ...layout.padding,
    nodeAlign: settings["sankey.node_align"],
    edgeLabel: { show: true },
    type: "sankey",
    draggable: false,
    data: echartsData,
    links,
    lineStyle: {
      color: "gradient",
      curveness: 0.5,
    },
    label: {
      color: renderingContext.getColor("text-dark"),
      fontSize: SANKEY_CHART_STYLE.nodeLabels.size,
      textBorderWidth: SANKEY_CHART_STYLE.nodeLabels.textBorderWidth,
      textBorderColor: renderingContext.getColor("white"),
    },
  };

  return {
    animation: false,
    series,
  };
};
