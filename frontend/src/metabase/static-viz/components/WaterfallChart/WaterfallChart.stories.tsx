import type { ComponentStory } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";
import { data } from "metabase/static-viz/components/WaterfallChart/stories-data";
import { registerVisualization } from "metabase/visualizations";
import { WaterfallChart } from "metabase/visualizations/visualizations/WaterfallChart";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(WaterfallChart);

export default {
  title: "static-viz/WaterfallChart",
  component: IsomorphicVisualizationStory,
};

const Template: ComponentStory<typeof IsomorphicVisualizationStory> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const YAxisCompactWithoutDataLabels = Template.bind({});
YAxisCompactWithoutDataLabels.args = {
  rawSeries: data.yAxisCompactWithoutDataLabels,
};

export const YAxisAutoCompactWithDataLabels = Template.bind({});
YAxisAutoCompactWithDataLabels.args = {
  rawSeries: data.yAxisAutoCompactWithDataLabels,
};

export const YAxisFullWithDataLabels = Template.bind({});
YAxisFullWithDataLabels.args = {
  rawSeries: data.yAxisFullWithDataLabels,
};

export const CustomYAxisRangeWithColumnScaling = Template.bind({});
CustomYAxisRangeWithColumnScaling.args = {
  rawSeries: data.customYAxisRangeWithColumnScaling,
};

export const TimeseriesXScale = Template.bind({});
TimeseriesXScale.args = {
  rawSeries: data.timeseriesXScale,
};

export const TimeseriesXScaleUnsorted = Template.bind({});
TimeseriesXScaleUnsorted.args = {
  rawSeries: data.timeseriesXScaleUnsorted,
};

export const OrdinalXScale = Template.bind({});
OrdinalXScale.args = {
  rawSeries: data.ordinalXScale,
};

export const TimeSeriesDataAsOrdinalXScale = Template.bind({});
TimeSeriesDataAsOrdinalXScale.args = {
  rawSeries: data.timeSeriesDataAsOrdinalXScale,
};

export const UnaggregatedOrdinal = Template.bind({});
UnaggregatedOrdinal.args = {
  rawSeries: data.unaggregatedOrdinal,
};

export const UnaggregatedLinear = Template.bind({});
UnaggregatedLinear.args = {
  rawSeries: data.unaggregatedLinear,
};

export const UnaggregatedTimeseries = Template.bind({});
UnaggregatedTimeseries.args = {
  rawSeries: data.unaggregatedTimeseries,
};

export const MixedAboveZero = Template.bind({});
MixedAboveZero.args = {
  rawSeries: data.mixedAboveZero,
};

export const MixedBelowZero = Template.bind({});
MixedBelowZero.args = {
  rawSeries: data.mixedBelowZero,
};

export const NegativeOnly = Template.bind({});
NegativeOnly.args = {
  rawSeries: data.negativeOnly,
};

export const StartsAboveZeroEndsBelow = Template.bind({});
StartsAboveZeroEndsBelow.args = {
  rawSeries: data.startsAboveZeroEndsBelow,
};

export const StartsBelowZeroEndsAbove = Template.bind({});
StartsBelowZeroEndsAbove.args = {
  rawSeries: data.startsBelowZeroEndsAbove,
};

export const StartsAboveZeroCrossesEndsAbove = Template.bind({});
StartsAboveZeroCrossesEndsAbove.args = {
  rawSeries: data.startsAboveZeroCrossesEndsAbove,
};

export const StartsBelowZeroCrossesEndsBelow = Template.bind({});
StartsBelowZeroCrossesEndsBelow.args = {
  rawSeries: data.startsBelowZeroCrossesEndsBelow,
};

export const CustomColors = Template.bind({});
CustomColors.args = {
  rawSeries: data.customColors,
};

export const NoTotalTimeseries = Template.bind({});
NoTotalTimeseries.args = {
  rawSeries: data.noTotalTimeseries,
};

export const NoTotalOrdinal = Template.bind({});
NoTotalOrdinal.args = {
  rawSeries: data.noTotalOrdinal,
};

export const DataLabels = Template.bind({});
DataLabels.args = {
  rawSeries: data.dataLabels,
};

export const DataLabelsColumnFormatting = Template.bind({});
DataLabelsColumnFormatting.args = {
  rawSeries: data.dataLabelsColumnFormatting,
};

export const DataLabelsTimeseries = Template.bind({});
DataLabelsTimeseries.args = {
  rawSeries: data.dataLabelsTimeseries,
};

export const DataLabelsMixed = Template.bind({});
DataLabelsMixed.args = {
  rawSeries: data.dataLabelsMixed,
};

export const PowYScale = Template.bind({});
PowYScale.args = {
  rawSeries: data.powYScale,
};

export const PowYScaleNegativeOnly = Template.bind({});
PowYScaleNegativeOnly.args = {
  rawSeries: data.powYScaleNegativeOnly,
};

export const PowYScaleMixed = Template.bind({});
PowYScaleMixed.args = {
  rawSeries: data.powYScaleMixed,
};

export const LogYScale = Template.bind({});
LogYScale.args = {
  rawSeries: data.logYScale,
};

export const LogYScaleNegative = Template.bind({});
LogYScaleNegative.args = {
  rawSeries: data.logYScaleNegative,
};

export const NativeTimeSeriesQuarter = Template.bind({});
NativeTimeSeriesQuarter.args = {
  rawSeries: data.nativeTimeSeriesQuarter,
};

export const NativeTimeSeriesWithGaps = Template.bind({});
NativeTimeSeriesWithGaps.args = {
  rawSeries: data.nativeTimeSeriesWithGaps,
};

export const StructuredTimeSeriesYear = Template.bind({});
StructuredTimeSeriesYear.args = {
  rawSeries: data.structuredTimeSeriesYear,
};

export const TimeXScaleTwoBarsWithoutTotal = Template.bind({});
TimeXScaleTwoBarsWithoutTotal.args = {
  rawSeries: data.timeXScaleTwoBarsWithoutTotal,
};

export const EnourmousDataset = Template.bind({});
EnourmousDataset.args = {
  rawSeries: data.enormousDataset,
};

export const Nulls = Template.bind({});
Nulls.args = {
  rawSeries: data.nulls,
};

export const NullXAxisValue = Template.bind({});
NullXAxisValue.args = {
  rawSeries: data.nullXAxisValue,
};

export const LinearNullDimension = Template.bind({});
LinearNullDimension.args = {
  rawSeries: data.linearNullDimension,
};

export const OrdinalNullDimension = Template.bind({});
OrdinalNullDimension.args = {
  rawSeries: data.ordinalNullDimension,
};

export const TwoBarsWithTotal = Template.bind({});
TwoBarsWithTotal.args = {
  rawSeries: data.twoBarsWithTotal,
};
