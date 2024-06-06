import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import { PieChart } from "./PieChart";
import { data } from "./stories-data";

export default {
  title: "static-viz/PieChart",
  component: PieChart,
};

const Template: ComponentStory<typeof PieChart> = args => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <PieChart {...args} isStorybook />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  formatValue: formatStaticValue as any,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

export const DefaultSettings = Template.bind({});
DefaultSettings.args = {
  rawSeries: data.defaultSettings as any,
  dashcardSettings: {},
  renderingContext,
};

export const AllSettings = Template.bind({});
AllSettings.args = {
  rawSeries: data.allSettings as any,
  dashcardSettings: {},
  renderingContext,
};

export const Colors = Template.bind({});
Colors.args = {
  rawSeries: data.colors as any,
  dashcardSettings: {},
  renderingContext,
};

export const HideLegend = Template.bind({});
HideLegend.args = {
  rawSeries: data.hideLegend as any,
  dashcardSettings: {},
  renderingContext,
};

export const HideTotal = Template.bind({});
HideTotal.args = {
  rawSeries: data.hideTotal as any,
  dashcardSettings: {},
  renderingContext,
};

export const SmallMinimumSlicePercentage = Template.bind({});
SmallMinimumSlicePercentage.args = {
  rawSeries: data.smallMinimumSlicePercentage as any,
  dashcardSettings: {},
  renderingContext,
};

export const LargeMinimumSlicePercentage = Template.bind({});
LargeMinimumSlicePercentage.args = {
  rawSeries: data.largeMinimumSlicePercentage as any,
  dashcardSettings: {},
  renderingContext,
};

export const ZeroMinimumSlicePercentage = Template.bind({});
ZeroMinimumSlicePercentage.args = {
  rawSeries: data.zeroMinimumSlicePercentage as any,
  dashcardSettings: {},
  renderingContext,
};

export const ShowPercentagesOff = Template.bind({});
ShowPercentagesOff.args = {
  rawSeries: data.showPercentagesOff as any,
  dashcardSettings: {},
  renderingContext,
};

export const ShowPercentagesOnChart = Template.bind({});
ShowPercentagesOnChart.args = {
  rawSeries: data.showPercentagesOnChart as any,
  dashcardSettings: {},
  renderingContext,
};

export const ShowPercentagesOnChartDense = Template.bind({});
ShowPercentagesOnChartDense.args = {
  rawSeries: data.showPercentagesOnChartDense as any,
  dashcardSettings: {},
  renderingContext,
};

export const AllNegative = Template.bind({});
AllNegative.args = {
  rawSeries: data.allNegative as any,
  dashcardSettings: {},
  renderingContext,
};

export const MixedPositiveNegative = Template.bind({});
MixedPositiveNegative.args = {
  rawSeries: data.mixedPositiveNegative as any,
  dashcardSettings: {},
  renderingContext,
};

export const ColumnFormatting = Template.bind({});
ColumnFormatting.args = {
  rawSeries: data.columnFormatting as any,
  dashcardSettings: {},
  renderingContext,
};

export const ColumnFormattingPercentagesOnChart = Template.bind({});
ColumnFormattingPercentagesOnChart.args = {
  rawSeries: data.columnFormattingPercentagesOnChart as any,
  dashcardSettings: {},
  renderingContext,
};

export const BooleanDimension = Template.bind({});
BooleanDimension.args = {
  rawSeries: data.booleanDimension as any,
  dashcardSettings: {},
  renderingContext,
};

export const NumericDimension = Template.bind({});
NumericDimension.args = {
  rawSeries: data.numericDimension as any,
  dashcardSettings: {},
  renderingContext,
};

export const BinnedDimension = Template.bind({});
BinnedDimension.args = {
  rawSeries: data.binnedDimension as any,
  dashcardSettings: {},
  renderingContext,
};

export const DateDimension = Template.bind({});
DateDimension.args = {
  rawSeries: data.dateDimension as any,
  dashcardSettings: {},
  renderingContext,
};

export const RelativeDateDimension = Template.bind({});
RelativeDateDimension.args = {
  rawSeries: data.relativeDateDimension as any,
  dashcardSettings: {},
  renderingContext,
};

export const NullDimension = Template.bind({});
NullDimension.args = {
  rawSeries: data.nullDimension as any,
  dashcardSettings: {},
  renderingContext,
};

export const UnaggregatedDimension = Template.bind({});
UnaggregatedDimension.args = {
  rawSeries: data.unaggregatedDimension as any,
  dashcardSettings: {},
  renderingContext,
};

export const SortedMetricCol = Template.bind({});
SortedMetricCol.args = {
  rawSeries: data.sortedMetricCol as any,
  dashcardSettings: {},
  renderingContext,
};

export const TinySlicesDisappear43766 = Template.bind({});
TinySlicesDisappear43766.args = {
  rawSeries: data.tinySlicesDisappear43766 as any,
  dashcardSettings: {},
  renderingContext,
};
