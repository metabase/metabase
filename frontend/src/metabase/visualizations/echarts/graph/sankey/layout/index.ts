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

  return sankeyData.nodes
    .map((node, index) => ({ node, index }))
    .filter(
      ({ node }) =>
        node.level === maxLevel ||
        (shouldIncludeAllNodesWithoutOutputs && !node.hasOutputs),
    );
};

const MAX_RIGHT_LABEL_LENGTH_PERCENT = 0.25;

export const getSankeyLayout = (
  chartModel: SankeyChartModel,
  settings: ComputedVisualizationSettings,
  width: number,
  height: number,
  renderingContext: RenderingContext,
): SankeyChartLayout => {
  const horizontalPadding = Math.max(
    width * SANKEY_CHART_STYLE.padding.percent,
    SANKEY_CHART_STYLE.padding.minPadding,
  );
  const verticalPadding = Math.max(
    height * SANKEY_CHART_STYLE.padding.percent,
    SANKEY_CHART_STYLE.padding.minPadding,
  );

  const padding = {
    top: verticalPadding,
    right: horizontalPadding,
    bottom: verticalPadding,
    left: horizontalPadding,
  };

  const mostRightNodes = getMostRightNodes(chartModel.data, settings);
  const maxRightLabelWidth = Math.max(
    ...mostRightNodes
      .map(({ node }) => chartModel.formatters.node(node.value))
      .map(formattedNode =>
        renderingContext.measureText(formattedNode, {
          ...SANKEY_CHART_STYLE.nodeLabels,
          family: renderingContext.fontFamily,
        }),
      ),
  );
  const maxAllowedRightLabel = MAX_RIGHT_LABEL_LENGTH_PERCENT * width;

  padding.right += Math.min(maxAllowedRightLabel, maxRightLabelWidth);
  const nodeIndicesWithTruncatedLabels =
    maxAllowedRightLabel < maxRightLabelWidth
      ? new Set(mostRightNodes.map(({ index }) => index))
      : null;

  return {
    padding,
    truncateLabelWidth: maxAllowedRightLabel,
    nodeIndicesWithTruncatedLabels,
  };
};
