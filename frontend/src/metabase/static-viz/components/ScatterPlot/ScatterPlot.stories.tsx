import type { StoryFn } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";

import type { StaticChartProps } from "../StaticVisualization";

import { data } from "./stories-data";

export default {
  title: "static-viz/ScatterPlot",
  component: IsomorphicVisualizationStory,
};

const Template: StoryFn<StaticChartProps> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const Default = {
  render: Template,
  args: {
    rawSeries: data.default,
  },
};

export const CustomYAxisRangeWithColumnScaling = {
  render: Template,
  args: {
    rawSeries: data.customYAxisRangeWithColumnScaling,
  },
};

export const MultiMetricSeries = {
  render: Template,
  args: {
    rawSeries: data.multiMetricSeries,
  },
};

export const MultiDimensionBreakout = {
  render: Template,
  args: {
    rawSeries: data.multiDimensionBreakout,
  },
};

export const BubbleSize = {
  render: Template,
  args: {
    rawSeries: data.bubbleSize,
  },
};

export const MultiDimensionBreakoutBubbleSize = {
  render: Template,
  args: {
    rawSeries: data.multiDimensionBreakoutBubbleSize,
  },
};

export const PowerXScale = {
  render: Template,
  args: {
    rawSeries: data.powerXScale,
  },
};

export const PowerXScaleMultiSeries = {
  render: Template,
  args: {
    rawSeries: data.powerXScaleMultiSeries,
  },
};

export const LogXScale = {
  render: Template,
  args: {
    rawSeries: data.logXScale,
  },
};

export const LogXScaleAtOne = {
  render: Template,
  args: {
    rawSeries: data.logXScaleAtOne,
  },
};

export const HistogramXScale = {
  render: Template,
  args: {
    rawSeries: data.histogramXScale,
  },
};

export const OrdinalXScale = {
  render: Template,
  args: {
    rawSeries: data.ordinalXScale,
  },
};

export const TimeseriesXScale = {
  render: Template,
  args: {
    rawSeries: data.timeseriesXScale,
  },
};

export const CustomYAxisRange = {
  render: Template,
  args: {
    rawSeries: data.customYAxisRange,
  },
};

export const AutoYAxisExcludeZeroWithGoal = {
  render: Template,
  args: {
    rawSeries: data.autoYAxisExcludeZeroWithGoal,
  },
};

export const GoalLine = {
  render: Template,
  args: {
    rawSeries: data.goalLine,
  },
};

export const PinToZero = {
  render: Template,
  args: {
    rawSeries: data.pinToZero,
  },
};
