import type { StoryFn } from "@storybook/react";

import {
  IsomorphicVisualizationStory,
  SdkVisualizationStory,
  createWaitForChartsDecorator,
} from "__support__/storybook";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { registerVisualizations } from "metabase/visualizations/register";
import type { RawSeries } from "metabase-types/api";

import * as data from "./stories-data";

registerVisualizations();

export default {
  title: "viz/SankeyChart",
  component: IsomorphicVisualizationStory,
  decorators: [createWaitForChartsDecorator({ count: 1 })],
};

type SankeyStoryProps = {
  rawSeries: RawSeries;
  theme?: MetabaseTheme;
};

const Template: StoryFn<SankeyStoryProps> = (args) => {
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

export const SankeyEdgeLabelsFullDarkBackground = {
  render: (args: SankeyStoryProps) => <SdkVisualizationStory {...args} />,
  args: {
    rawSeries: data.sankeyEdgeLabelsFull,
    theme: { colors: { background: "#2d2d3d", "text-primary": "#fff" } },
  },
};

export const SankeyEdgeLabelsCompact = {
  render: Template,
  args: {
    rawSeries: data.sankeyEdgeLabelsCompact,
  },
};
