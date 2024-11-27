import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { SANKEY_CHART_STYLE } from "../constants/style";
import type { SankeyChartModel, SankeyData } from "../model/types";

import type { SankeyChartLayout } from "./types";

const getLastLevelIndex = (sankeyData: SankeyData) =>
  Math.max(...sankeyData.nodes.map(node => node.level));

const getMostRightNodes = (
  sankeyData: SankeyData,
  maxLevel: number,
  settings: ComputedVisualizationSettings,
) => {
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

const getLabelValueFormatting = (
  chartModel: SankeyChartModel,
  settings: ComputedVisualizationSettings,
  boundaryWidth: number,
  nodeLevelsCount: number,
  renderingContext: RenderingContext,
): SankeyChartLayout["labelValueFormatting"] => {
  if (!settings["sankey.show_edge_labels"]) {
    return null;
  }

  if (
    settings["sankey.label_value_formatting"] === "compact" ||
    settings["sankey.label_value_formatting"] === "full"
  ) {
    return settings["sankey.label_value_formatting"];
  }

  const maxEdgeLabelWidth = Math.max(
    ...chartModel.data.links.map(edge => {
      const formattedValue = chartModel.formatters.value(edge.value);
      return renderingContext.measureText(formattedValue, {
        ...SANKEY_CHART_STYLE.edgeLabels,
        family: renderingContext.fontFamily,
      });
    }),
  );

  const totalNodesWidth = SANKEY_CHART_STYLE.nodeWidth * nodeLevelsCount;
  const widthPerLevel =
    (boundaryWidth - totalNodesWidth) / Math.max(nodeLevelsCount - 1, 1);

  return maxEdgeLabelWidth >= widthPerLevel ? "compact" : "full";
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

  const lastLevelIndex = getLastLevelIndex(chartModel.data);

  const mostRightNodes = getMostRightNodes(
    chartModel.data,
    lastLevelIndex,
    settings,
  );
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

  const boundaryWidth = width - padding.left - padding.right;
  const labelValueFormatting = getLabelValueFormatting(
    chartModel,
    settings,
    boundaryWidth,
    lastLevelIndex + 1,
    renderingContext,
  );

  return {
    padding,
    truncateLabelWidth: maxAllowedRightLabel,
    nodeIndicesWithTruncatedLabels,
    labelValueFormatting,
  };
};
