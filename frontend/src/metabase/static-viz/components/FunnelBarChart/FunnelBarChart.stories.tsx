import type { StoryFn } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";

import type { StaticChartProps } from "../StaticVisualization";

import { data } from "./stories-data";

export default {
  title: "static-viz/FunnelBarChart",
  component: IsomorphicVisualizationStory,
};

const Template: StoryFn<StaticChartProps> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const Default = {
  render: Template,
  args: {
    rawSeries: data.funnelBarCategorical,
  },
};

export const FunnelBarOrderedRows = {
  render: Template,
  args: {
    rawSeries: data.funnelBarOrderedRows,
  },
};

export const FunnelBarUnorderedRows = {
  render: Template,
  args: {
    rawSeries: data.funnelBarUnorderedRows,
  },
};
