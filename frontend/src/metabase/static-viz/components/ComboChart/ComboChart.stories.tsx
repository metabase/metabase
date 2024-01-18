import type { ComponentStory } from "@storybook/react";
import { color } from "metabase/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import type { RenderingContext } from "metabase/visualizations/types";

import { ComboChart } from "./ComboChart";
import { data } from "./stories-data";

export default {
  title: "static-viz/ComboChart",
  component: ComboChart,
};

const Template: ComponentStory<typeof ComboChart> = args => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <ComboChart {...args} />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  formatValue: formatStaticValue as any,
  measureText: (text, style) =>
    measureTextWidth(text, style.size, style.weight),
  fontFamily: "Lato",
};

export const LineLinearXScale = Template.bind({});
LineLinearXScale.args = {
  rawSeries: data.lineLinearXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineLinearXScaleUnsorted = Template.bind({});
LineLinearXScaleUnsorted.args = {
  rawSeries: data.lineLinearXScaleUnsorted as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineShowDotsAuto = Template.bind({});
LineShowDotsAuto.args = {
  rawSeries: data.lineShowDotsAuto as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineShowDotsOn = Template.bind({});
LineShowDotsOn.args = {
  rawSeries: data.lineShowDotsOn as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineShowDotsOff = Template.bind({});
LineShowDotsOff.args = {
  rawSeries: data.lineShowDotsOff as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarLinearXScale = Template.bind({});
BarLinearXScale.args = {
  rawSeries: data.barLinearXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarHistogramXScale = Template.bind({});
BarHistogramXScale.args = {
  rawSeries: data.barHistogramXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarOrdinalXScale = Template.bind({});
BarOrdinalXScale.args = {
  rawSeries: data.barOrdinalXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedTotalFormattedValues = Template.bind({});
BarStackedTotalFormattedValues.args = {
  rawSeries: data.barStackedTotalFormattedValues as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarTwoAxesStackedWithNegativeValues = Template.bind({});
BarTwoAxesStackedWithNegativeValues.args = {
  rawSeries: data.barTwoAxesStackedWithNegativeValues as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarBreakoutWithLineSeriesStackedRightAxisOnly = Template.bind({});
BarBreakoutWithLineSeriesStackedRightAxisOnly.args = {
  rawSeries: data.barBreakoutWithLineSeriesStackedRightAxisOnly as any,
  dashcardSettings: {},
  renderingContext,
};

export const SplitYAxis = Template.bind({});
SplitYAxis.args = {
  rawSeries: data.autoYSplit as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendSingleSeriesLine = Template.bind({});
TrendSingleSeriesLine.args = {
  rawSeries: data.trendSingleSeriesLine as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesLine = Template.bind({});
TrendMultiSeriesLine.args = {
  rawSeries: data.trendMultiSeriesLine as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendSingleSeriesArea = Template.bind({});
TrendSingleSeriesArea.args = {
  rawSeries: data.trendSingleSeriesArea as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesArea = Template.bind({});
TrendMultiSeriesArea.args = {
  rawSeries: data.trendMultiSeriesArea as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesStackedArea = Template.bind({});
TrendMultiSeriesStackedArea.args = {
  rawSeries: data.trendMultiSeriesStackedArea as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesNormalizedStackedArea = Template.bind({});
TrendMultiSeriesNormalizedStackedArea.args = {
  rawSeries: data.trendMultiSeriesNormalizedStackedArea as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendSingleSeriesBar = Template.bind({});
TrendSingleSeriesBar.args = {
  rawSeries: data.trendSingleSeriesBar as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesBar = Template.bind({});
TrendMultiSeriesBar.args = {
  rawSeries: data.trendMultiSeriesBar as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesStackedBar = Template.bind({});
TrendMultiSeriesStackedBar.args = {
  rawSeries: data.trendMultiSeriesStackedBar as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesNormalizedStackedBar = Template.bind({});
TrendMultiSeriesNormalizedStackedBar.args = {
  rawSeries: data.trendMultiSeriesNormalizedStackedBar as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendCombo = Template.bind({});
TrendCombo.args = {
  rawSeries: data.trendCombo as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendComboPower = Template.bind({});
TrendComboPower.args = {
  rawSeries: data.trendComboPower as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendComboLog = Template.bind({});
TrendComboLog.args = {
  rawSeries: data.trendComboLog as any,
  dashcardSettings: {},
  renderingContext,
};

export const CombinedBarTimeSeriesDifferentGranularityWithBreakout =
  Template.bind({});
CombinedBarTimeSeriesDifferentGranularityWithBreakout.args = {
  rawSeries: data.combinedBarTimeSeriesDifferentGranularityWithBreakout as any,
  dashcardSettings: {},
  renderingContext,
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.messedUpAxis as any,
  dashcardSettings: {},
  renderingContext,
};
