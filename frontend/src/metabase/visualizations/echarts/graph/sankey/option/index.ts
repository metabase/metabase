import type { SankeySeriesOption } from "echarts/charts";
import type { EChartsCoreOption } from "echarts/core";

import { truncateText } from "metabase/visualizations/lib/text";
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
  const nodes = data.nodes.map((node) => {
    const formattedName = formatters.node(node);

    return {
      ...node,
      name: formattedName,
      value: formattedName,
      itemStyle: {
        color: chartModel.nodeColors[String(node.rawName)],
      },
    };
  });
  const links = data.links.map((link) => ({
    ...link,
    source: formatters.source(link.source),
    target: formatters.target(link.target),
    value: typeof link.value === "number" ? link.value : undefined,
  }));

  const edgeColor =
    settings["sankey.edge_color"] === "gray"
      ? SANKEY_CHART_STYLE.edgeColor.gray
      : settings["sankey.edge_color"];

  const nodeLabelStyle = {
    ...SANKEY_CHART_STYLE.nodeLabels,
    family: renderingContext.fontFamily,
  };

  const valueFormatter =
    layout.labelValueFormatting === "compact"
      ? formatters.valueCompact
      : formatters.value;

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
      formatter: (params) =>
        typeof params.value === "number" ? valueFormatter(params.value) : "",
      color: renderingContext.getColor("text-primary"),
      fontSize: SANKEY_CHART_STYLE.edgeLabels.size,
      textBorderWidth: SANKEY_CHART_STYLE.edgeLabels.textBorderWidth,
      textBorderColor: renderingContext.getColor("background-primary"),
      fontFamily: renderingContext.fontFamily,
    },
    emphasis: {
      focus: "adjacency",
    },
    draggable: false,
    nodes,
    links,
    nodeWidth: SANKEY_CHART_STYLE.nodeWidth,
    lineStyle: {
      color: edgeColor,
      opacity: 0.2,
      curveness: 0.5,
    },
    label: {
      color: renderingContext.getColor("text-primary"),
      fontSize: nodeLabelStyle.size,
      fontWeight: nodeLabelStyle.weight,
      fontFamily: nodeLabelStyle.family,
      textBorderWidth: SANKEY_CHART_STYLE.nodeLabels.textBorderWidth,
      textBorderColor: renderingContext.getColor("background-primary"),
      formatter: (param) => {
        const shouldTruncate = layout.nodeIndicesWithTruncatedLabels?.has(
          param.dataIndex,
        );
        if (shouldTruncate) {
          return truncateText(
            String(param.value),
            layout.truncateLabelWidth,
            renderingContext.measureText,
            nodeLabelStyle,
          );
        }
        return String(param.value);
      },
    },
  };

  return {
    series,
  };
};
