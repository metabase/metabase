import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import { data } from "metabase/static-viz/components/WaterfallChart/stories-data";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import type { RenderingContext } from "metabase/visualizations/types";

import { WaterfallChart } from "./WaterfallChart";

export default {
  title: "static-viz/WaterfallChart",
  component: WaterfallChart,
};

const Template: ComponentStory<typeof WaterfallChart> = args => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <WaterfallChart {...args} isStorybook />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  formatValue: formatStaticValue as any,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  fontFamily: "Lato",
};

export const YAxisCompactWithoutDataLabels = Template.bind({});
YAxisCompactWithoutDataLabels.args = {
  rawSeries: data.yAxisCompactWithoutDataLabels as any,
  renderingContext,
};

export const YAxisAutoCompactWithDataLabels = Template.bind({});
YAxisAutoCompactWithDataLabels.args = {
  rawSeries: data.yAxisAutoCompactWithDataLabels as any,
  renderingContext,
};

export const YAxisFullWithDataLabels = Template.bind({});
YAxisFullWithDataLabels.args = {
  rawSeries: data.yAxisFullWithDataLabels as any,
  renderingContext,
};

export const CustomYAxisRangeWithColumnScaling = Template.bind({});
CustomYAxisRangeWithColumnScaling.args = {
  rawSeries: data.customYAxisRangeWithColumnScaling as any,
  renderingContext,
};

export const TimeseriesXScale = Template.bind({});
TimeseriesXScale.args = {
  rawSeries: data.timeseriesXScale as any,
  renderingContext,
};

export const TimeseriesXScaleUnsorted = Template.bind({});
TimeseriesXScaleUnsorted.args = {
  rawSeries: data.timeseriesXScaleUnsorted as any,
  renderingContext,
};

export const OrdinalXScale = Template.bind({});
OrdinalXScale.args = {
  rawSeries: data.ordinalXScale as any,
  renderingContext,
};

export const TimeSeriesDataAsOrdinalXScale = Template.bind({});
TimeSeriesDataAsOrdinalXScale.args = {
  rawSeries: data.timeSeriesDataAsOrdinalXScale as any,
  renderingContext,
};

export const UnaggregatedOrdinal = Template.bind({});
UnaggregatedOrdinal.args = {
  rawSeries: data.unaggregatedOrdinal as any,
  renderingContext,
};

export const UnaggregatedLinear = Template.bind({});
UnaggregatedLinear.args = {
  rawSeries: data.unaggregatedLinear as any,
  renderingContext,
};

export const UnaggregatedTimeseries = Template.bind({});
UnaggregatedTimeseries.args = {
  rawSeries: data.unaggregatedTimeseries as any,
  renderingContext,
};

export const MixedAboveZero = Template.bind({});
MixedAboveZero.args = {
  rawSeries: data.mixedAboveZero as any,
  renderingContext,
};

export const MixedBelowZero = Template.bind({});
MixedBelowZero.args = {
  rawSeries: data.mixedBelowZero as any,
  renderingContext,
};

export const NegativeOnly = Template.bind({});
NegativeOnly.args = {
  rawSeries: data.negativeOnly as any,
  renderingContext,
};

export const StartsAboveZeroEndsBelow = Template.bind({});
StartsAboveZeroEndsBelow.args = {
  rawSeries: data.startsAboveZeroEndsBelow as any,
  renderingContext,
};

export const StartsBelowZeroEndsAbove = Template.bind({});
StartsBelowZeroEndsAbove.args = {
  rawSeries: data.startsBelowZeroEndsAbove as any,
  renderingContext,
};

export const StartsAboveZeroCrossesEndsAbove = Template.bind({});
StartsAboveZeroCrossesEndsAbove.args = {
  rawSeries: data.startsAboveZeroCrossesEndsAbove as any,
  renderingContext,
};

export const StartsBelowZeroCrossesEndsBelow = Template.bind({});
StartsBelowZeroCrossesEndsBelow.args = {
  rawSeries: data.startsBelowZeroCrossesEndsBelow as any,
  renderingContext,
};

export const CustomColors = Template.bind({});
CustomColors.args = {
  rawSeries: data.customColors as any,
  renderingContext,
};

export const NoTotalTimeseries = Template.bind({});
NoTotalTimeseries.args = {
  rawSeries: data.noTotalTimeseries as any,
  renderingContext,
};

export const NoTotalOrdinal = Template.bind({});
NoTotalOrdinal.args = {
  rawSeries: data.noTotalOrdinal as any,
  renderingContext,
};

export const DataLabels = Template.bind({});
DataLabels.args = {
  rawSeries: data.dataLabels as any,
  renderingContext,
};

export const DataLabelsColumnFormatting = Template.bind({});
DataLabelsColumnFormatting.args = {
  rawSeries: data.dataLabelsColumnFormatting as any,
  renderingContext,
};

export const DataLabelsTimeseries = Template.bind({});
DataLabelsTimeseries.args = {
  rawSeries: data.dataLabelsTimeseries as any,
  renderingContext,
};

export const DataLabelsMixed = Template.bind({});
DataLabelsMixed.args = {
  rawSeries: data.dataLabelsMixed as any,
  renderingContext,
};

export const PowYScale = Template.bind({});
PowYScale.args = {
  rawSeries: data.powYScale as any,
  renderingContext,
};

export const PowYScaleNegativeOnly = Template.bind({});
PowYScaleNegativeOnly.args = {
  rawSeries: data.powYScaleNegativeOnly as any,
  renderingContext,
};

export const PowYScaleMixed = Template.bind({});
PowYScaleMixed.args = {
  rawSeries: data.powYScaleMixed as any,
  renderingContext,
};

export const LogYScale = Template.bind({});
LogYScale.args = {
  rawSeries: data.logYScale as any,
  renderingContext,
};

export const LogYScaleNegative = Template.bind({});
LogYScaleNegative.args = {
  rawSeries: data.logYScaleNegative as any,
  renderingContext,
};

export const NativeTimeSeriesQuarter = Template.bind({});
NativeTimeSeriesQuarter.args = {
  rawSeries: data.nativeTimeSeriesQuarter as any,
  renderingContext,
};

export const NativeTimeSeriesWithGaps = Template.bind({});
NativeTimeSeriesWithGaps.args = {
  rawSeries: data.nativeTimeSeriesWithGaps as any,
  renderingContext,
};

export const StructuredTimeSeriesYear = Template.bind({});
StructuredTimeSeriesYear.args = {
  rawSeries: data.structuredTimeSeriesYear as any,
  renderingContext,
};

export const TimeXScaleTwoBarsWithoutTotal = Template.bind({});
TimeXScaleTwoBarsWithoutTotal.args = {
  rawSeries: data.timeXScaleTwoBarsWithoutTotal as any,
  renderingContext,
};

export const EnourmousDataset = Template.bind({});
EnourmousDataset.args = {
  rawSeries: data.enormousDataset as any,
  renderingContext,
};

export const Nulls = Template.bind({});
Nulls.args = {
  rawSeries: data.nulls as any,
  renderingContext,
};

export const NullXAxisValue = Template.bind({});
NullXAxisValue.args = {
  rawSeries: data.nullXAxisValue as any,
  renderingContext,
};

export const LinearNullDimension = Template.bind({});
LinearNullDimension.args = {
  rawSeries: data.linearNullDimension as any,
  renderingContext,
};

export const OrdinalNullDimension = Template.bind({});
OrdinalNullDimension.args = {
  rawSeries: data.ordinalNullDimension as any,
  renderingContext,
};

export const TwoBarsWithTotal = Template.bind({});
TwoBarsWithTotal.args = {
  rawSeries: data.twoBarsWithTotal as any,
  renderingContext,
};
