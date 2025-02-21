import type { StoryFn } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";
import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";

import * as data from "./stories-data";

export default {
  title: "viz/SankeyChart",
  component: IsomorphicVisualizationStory,
};

const Template: StoryFn<StaticChartProps> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const SankeyUnaggregatedData = {
  render: Template,
  args: {
    rawSeries: data.sankeyUnaggregatedData,
  },
};

export const SankeyWithEdgesLabels = {
  render: Template,
  args: {
    rawSeries: data.sankeyWithEdgesLabels,
  },
};

export const SankeyNodeAlignJustify = {
  render: Template,
  args: {
    rawSeries: data.sankeyNodeAlignJustify,
  },
};

export const SankeyNodeAlignLeft = {
  render: Template,
  args: {
    rawSeries: data.sankeyNodeAlignLeft,
  },
};

export const SankeyNodeAlignRight = {
  render: Template,
  args: {
    rawSeries: data.sankeyNodeAlignRight,
  },
};

export const SankeyDisconnectedGraphs = {
  render: Template,
  args: {
    rawSeries: data.sankeyDisconnectedGraphs,
  },
};

export const SankeyGrayEdges = {
  render: Template,
  args: {
    rawSeries: data.sankeyGrayEdges,
  },
};

export const SankeyTargetColorEdges = {
  render: Template,
  args: {
    rawSeries: data.sankeyTargetColorEdges,
  },
};

export const SankeyEdgeLabelsAuto = {
  render: Template,
  args: {
    rawSeries: data.sankeyEdgeLabelsAuto,
  },
};

export const SankeyEdgeLabelsFull = {
  render: Template,
  args: {
    rawSeries: data.sankeyEdgeLabelsFull,
  },
};

export const SankeyEdgeLabelsCompact = {
  render: Template,
  args: {
    rawSeries: data.sankeyEdgeLabelsCompact,
  },
};
