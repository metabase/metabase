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
      <ComboChart {...args} isStorybook />
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

export const LineCustomYAxisRangeEqualsExtents = Template.bind({});
LineCustomYAxisRangeEqualsExtents.args = {
  rawSeries: data.lineCustomYAxisRangeEqualsExtents as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineFullyNullDimension37902 = Template.bind({});
LineFullyNullDimension37902.args = {
  rawSeries: data.lineFullyNullDimension37902 as any,
  dashcardSettings: {},
  renderingContext,
};

export const AreaFullyNullDimension37902 = Template.bind({});
AreaFullyNullDimension37902.args = {
  rawSeries: data.areaFullyNullDimension37902 as any,
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

export const BarHistogramMultiSeries = Template.bind({});
BarHistogramMultiSeries.args = {
  rawSeries: data.barHistogramMultiSeries as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarHistogramStacked = Template.bind({});
BarHistogramStacked.args = {
  rawSeries: data.barHistogramStacked as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarHistogramStackedNormalized = Template.bind({});
BarHistogramStackedNormalized.args = {
  rawSeries: data.barHistogramStackedNormalized as any,
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

export const BarStackedNormalizedEmptySpace37880 = Template.bind({});
BarStackedNormalizedEmptySpace37880.args = {
  rawSeries: data.barStackedNormalizedEmptySpace37880 as any,
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

export const BarsBreakoutSortedWithNegativeValuesPowerYAxis = Template.bind({});
BarsBreakoutSortedWithNegativeValuesPowerYAxis.args = {
  rawSeries: data.barsBreakoutSortedWithNegativeValuesPowerYAxis as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarFullyNullDimension37902 = Template.bind({});
BarFullyNullDimension37902.args = {
  rawSeries: data.barFullyNullDimension37902 as any,
  dashcardSettings: {},
  renderingContext,
};

export const SplitYAxis = Template.bind({});
SplitYAxis.args = {
  rawSeries: data.autoYSplit as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalLineOutOfBounds37848 = Template.bind({});
GoalLineOutOfBounds37848.args = {
  rawSeries: data.goalLineOutOfBounds37848 as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalVerySmall = Template.bind({});
GoalVerySmall.args = {
  rawSeries: data.goalVerySmall as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalBetweenExtentAndChartBound = Template.bind({});
GoalBetweenExtentAndChartBound.args = {
  rawSeries: data.goalBetweenExtentAndChartBound as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalLineDisabled = Template.bind({});
GoalLineDisabled.args = {
  rawSeries: data.goalLineDisabled as any,
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

export const NumericXAxisIncludesZero37082 = Template.bind({});
NumericXAxisIncludesZero37082.args = {
  rawSeries: data.numbericXAxisIncludesZero37082 as any,
  dashcardSettings: {},
  renderingContext,
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.messedUpAxis as any,
  dashcardSettings: {},
  renderingContext,
};
