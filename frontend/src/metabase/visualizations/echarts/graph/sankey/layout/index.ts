import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { SANKEY_CHART_STYLE } from "../constants/style";
import type { SankeyChartModel, SankeyData } from "../model/types";

import type { SankeyChartLayout } from "./types";

const getMostRightNodes = (
  sankeyData: SankeyData,
  settings: ComputedVisualizationSettings,
) => {
  const maxLevel = Math.max(...sankeyData.nodes.map(node => node.level));
  const shouldIncludeAllNodesWithoutOutputs =
    settings["sankey.node_align"] !== "left";

  return sankeyData.nodes.filter(
    node =>
      node.level === maxLevel ||
      (shouldIncludeAllNodesWithoutOutputs && !node.hasOutputs),
  );
};

export const getSankeyLayout = (
  chartModel: SankeyChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): SankeyChartLayout => {
  const padding = {
    top: SANKEY_CHART_STYLE.padding.y,
    right: SANKEY_CHART_STYLE.padding.x,
    bottom: SANKEY_CHART_STYLE.padding.y,
    left: SANKEY_CHART_STYLE.padding.x,
  };

  const mostRightNodes = getMostRightNodes(chartModel.data, settings);

  const maxRightLabelWidth = Math.max(
    ...mostRightNodes
      .map(node => chartModel.formatters.node(node.value))
      .map(formattedNode =>
        renderingContext.measureText(formattedNode, {
          ...SANKEY_CHART_STYLE.nodeLabels,
          family: renderingContext.fontFamily,
        }),
      ),
  );

  padding.right += maxRightLabelWidth;

  return { padding };
};
