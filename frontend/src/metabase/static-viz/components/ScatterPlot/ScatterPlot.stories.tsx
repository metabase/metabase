import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import { ScatterPlot } from "./ScatterPlot";
import { data } from "./stories-data";

export default {
  title: "static-viz/ScatterPlot",
  component: ScatterPlot,
};

const Template: ComponentStory<typeof ScatterPlot> = args => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <ScatterPlot {...args} isStorybook />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  formatValue: formatStaticValue as any,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  measureTextHeight: (_, style) => measureTextHeight(Number(style.size)),
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.default as any,
  dashcardSettings: {},
  renderingContext,
};

export const CustomYAxisRangeWithColumnScaling = Template.bind({});
CustomYAxisRangeWithColumnScaling.args = {
  rawSeries: data.customYAxisRangeWithColumnScaling as any,
  dashcardSettings: {},
  renderingContext,
};

export const MultiMetricSeries = Template.bind({});
MultiMetricSeries.args = {
  rawSeries: data.multiMetricSeries as any,
  dashcardSettings: {},
  renderingContext,
};

export const MultiDimensionBreakout = Template.bind({});
MultiDimensionBreakout.args = {
  rawSeries: data.multiDimensionBreakout as any,
  dashcardSettings: {},
  renderingContext,
};

export const BubbleSize = Template.bind({});
BubbleSize.args = {
  rawSeries: data.bubbleSize as any,
  dashcardSettings: {},
  renderingContext,
};

export const MultiDimensionBreakoutBubbleSize = Template.bind({});
MultiDimensionBreakoutBubbleSize.args = {
  rawSeries: data.multiDimensionBreakoutBubbleSize as any,
  dashcardSettings: {},
  renderingContext,
};

export const PowerXScale = Template.bind({});
PowerXScale.args = {
  rawSeries: data.powerXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const PowerXScaleMultiSeries = Template.bind({});
PowerXScaleMultiSeries.args = {
  rawSeries: data.powerXScaleMultiSeries as any,
  dashcardSettings: {},
  renderingContext,
};

export const LogXScale = Template.bind({});
LogXScale.args = {
  rawSeries: data.logXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const LogXScaleAtOne = Template.bind({});
LogXScaleAtOne.args = {
  rawSeries: data.logXScaleAtOne as any,
  dashcardSettings: {},
  renderingContext,
};

export const HistogramXScale = Template.bind({});
HistogramXScale.args = {
  rawSeries: data.histogramXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const OrdinalXScale = Template.bind({});
OrdinalXScale.args = {
  rawSeries: data.ordinalXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const TimeseriesXScale = Template.bind({});
TimeseriesXScale.args = {
  rawSeries: data.timeseriesXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const CustomYAxisRange = Template.bind({});
CustomYAxisRange.args = {
  rawSeries: data.customYAxisRange as any,
  dashcardSettings: {},
  renderingContext,
};

export const AutoYAxisExcludeZeroWithGoal = Template.bind({});
AutoYAxisExcludeZeroWithGoal.args = {
  rawSeries: data.autoYAxisExcludeZeroWithGoal as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalLine = Template.bind({});
GoalLine.args = {
  rawSeries: data.goalLine as any,
  dashcardSettings: {},
  renderingContext,
};

export const PinToZero = Template.bind({});
PinToZero.args = {
  rawSeries: data.pinToZero as any,
  dashcardSettings: {},
  renderingContext,
};
