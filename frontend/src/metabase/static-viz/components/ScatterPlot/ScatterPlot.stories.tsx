import type { ComponentStory } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";
import { registerVisualization } from "metabase/visualizations";
import { ScatterPlot } from "metabase/visualizations/visualizations/ScatterPlot";

import { data } from "./stories-data";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(ScatterPlot);

export default {
  title: "static-viz/ScatterPlot",
  component: IsomorphicVisualizationStory,
};

const Template: ComponentStory<typeof IsomorphicVisualizationStory> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.default,
};

export const CustomYAxisRangeWithColumnScaling = Template.bind({});
CustomYAxisRangeWithColumnScaling.args = {
  rawSeries: data.customYAxisRangeWithColumnScaling,
};

export const MultiMetricSeries = Template.bind({});
MultiMetricSeries.args = {
  rawSeries: data.multiMetricSeries,
};

export const MultiDimensionBreakout = Template.bind({});
MultiDimensionBreakout.args = {
  rawSeries: data.multiDimensionBreakout,
};

export const BubbleSize = Template.bind({});
BubbleSize.args = {
  rawSeries: data.bubbleSize,
};

export const MultiDimensionBreakoutBubbleSize = Template.bind({});
MultiDimensionBreakoutBubbleSize.args = {
  rawSeries: data.multiDimensionBreakoutBubbleSize,
};

export const PowerXScale = Template.bind({});
PowerXScale.args = {
  rawSeries: data.powerXScale,
};

export const PowerXScaleMultiSeries = Template.bind({});
PowerXScaleMultiSeries.args = {
  rawSeries: data.powerXScaleMultiSeries,
};

export const LogXScale = Template.bind({});
LogXScale.args = {
  rawSeries: data.logXScale,
};

export const LogXScaleAtOne = Template.bind({});
LogXScaleAtOne.args = {
  rawSeries: data.logXScaleAtOne,
};

export const HistogramXScale = Template.bind({});
HistogramXScale.args = {
  rawSeries: data.histogramXScale,
};

export const OrdinalXScale = Template.bind({});
OrdinalXScale.args = {
  rawSeries: data.ordinalXScale,
};

export const TimeseriesXScale = Template.bind({});
TimeseriesXScale.args = {
  rawSeries: data.timeseriesXScale,
};

export const CustomYAxisRange = Template.bind({});
CustomYAxisRange.args = {
  rawSeries: data.customYAxisRange,
};

export const AutoYAxisExcludeZeroWithGoal = Template.bind({});
AutoYAxisExcludeZeroWithGoal.args = {
  rawSeries: data.autoYAxisExcludeZeroWithGoal,
};

export const GoalLine = Template.bind({});
GoalLine.args = {
  rawSeries: data.goalLine,
};

export const PinToZero = Template.bind({});
PinToZero.args = {
  rawSeries: data.pinToZero,
};
