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
  const nodes = data.nodes.map(node => ({
    ...node,
    name: formatters.node(node.value),
    value: formatters.node(node.value),
    itemStyle: {
      color: chartModel.nodeColors[String(node.value)],
    },
  }));
  const links = data.links.map(link => ({
    ...link,
    source: formatters.node(link.source),
    target: formatters.node(link.target),
    value: typeof link.value === "number" ? link.value : undefined,
  }));

  const edgeColor =
    settings["sankey.edge_color"] === "gray"
      ? SANKEY_CHART_STYLE.edgeColor.gray
      : settings["sankey.edge_color"];

  const edgeLabelColor =
    settings["sankey.edge_color"] === "gray"
      ? renderingContext.getColor("text-dark")
      : renderingContext.getColor("text-light");

  const series: SankeySeriesOption = {
    animation: false,
    type: "sankey",
    labelLayout: {
      hideOverlap: true,
    },
    ...layout.padding,
    nodeAlign: settings["sankey.node_align"],
    edgeLabel: {
      show: settings["sankey.show_edge_labels"],
      formatter: params =>
        typeof params.value === "number" ? formatters.value(params.value) : "",
      color: edgeLabelColor,
      fontSize: SANKEY_CHART_STYLE.nodeLabels.size,
      fontFamily: renderingContext.fontFamily,
    },
    emphasis: {
      focus: "adjacency",
    },
    draggable: false,
    nodes,
    links,
    lineStyle: {
      color: edgeColor,
      opacity: 0.2,
      curveness: 0.5,
    },
    label: {
      color: renderingContext.getColor("text-dark"),
      fontSize: SANKEY_CHART_STYLE.nodeLabels.size,
      textBorderWidth: SANKEY_CHART_STYLE.nodeLabels.textBorderWidth,
      textBorderColor: renderingContext.getColor("white"),
      fontFamily: renderingContext.fontFamily,
    },
  };

  return {
    series,
  };
};
