import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import { data } from "metabase/static-viz/components/WaterfallChart/stories-data";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import {
  measureTextWidth,
  measureTextHeight,
} from "metabase/static-viz/lib/text";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
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
  measureTextHeight: (_, style) => measureTextHeight(Number(style.size)),
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

export const YAxisCompactWithoutDataLabels = Template.bind({});
YAxisCompactWithoutDataLabels.args = {
  rawSeries: data.yAxisCompactWithoutDataLabels as any,
  dashcardSettings: {},
  renderingContext,
};

export const YAxisAutoCompactWithDataLabels = Template.bind({});
YAxisAutoCompactWithDataLabels.args = {
  rawSeries: data.yAxisAutoCompactWithDataLabels as any,
  dashcardSettings: {},
  renderingContext,
};

export const YAxisFullWithDataLabels = Template.bind({});
YAxisFullWithDataLabels.args = {
  rawSeries: data.yAxisFullWithDataLabels as any,
  dashcardSettings: {},
  renderingContext,
};

export const CustomYAxisRangeWithColumnScaling = Template.bind({});
CustomYAxisRangeWithColumnScaling.args = {
  rawSeries: data.customYAxisRangeWithColumnScaling as any,
  dashcardSettings: {},
  renderingContext,
};

export const TimeseriesXScale = Template.bind({});
TimeseriesXScale.args = {
  rawSeries: data.timeseriesXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const TimeseriesXScaleUnsorted = Template.bind({});
TimeseriesXScaleUnsorted.args = {
  rawSeries: data.timeseriesXScaleUnsorted as any,
  dashcardSettings: {},
  renderingContext,
};

export const OrdinalXScale = Template.bind({});
OrdinalXScale.args = {
  rawSeries: data.ordinalXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const TimeSeriesDataAsOrdinalXScale = Template.bind({});
TimeSeriesDataAsOrdinalXScale.args = {
  rawSeries: data.timeSeriesDataAsOrdinalXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const UnaggregatedOrdinal = Template.bind({});
UnaggregatedOrdinal.args = {
  rawSeries: data.unaggregatedOrdinal as any,
  dashcardSettings: {},
  renderingContext,
};

export const UnaggregatedLinear = Template.bind({});
UnaggregatedLinear.args = {
  rawSeries: data.unaggregatedLinear as any,
  dashcardSettings: {},
  renderingContext,
};

export const UnaggregatedTimeseries = Template.bind({});
UnaggregatedTimeseries.args = {
  rawSeries: data.unaggregatedTimeseries as any,
  dashcardSettings: {},
  renderingContext,
};

export const MixedAboveZero = Template.bind({});
MixedAboveZero.args = {
  rawSeries: data.mixedAboveZero as any,
  dashcardSettings: {},
  renderingContext,
};

export const MixedBelowZero = Template.bind({});
MixedBelowZero.args = {
  rawSeries: data.mixedBelowZero as any,
  dashcardSettings: {},
  renderingContext,
};

export const NegativeOnly = Template.bind({});
NegativeOnly.args = {
  rawSeries: data.negativeOnly as any,
  dashcardSettings: {},
  renderingContext,
};

export const StartsAboveZeroEndsBelow = Template.bind({});
StartsAboveZeroEndsBelow.args = {
  rawSeries: data.startsAboveZeroEndsBelow as any,
  dashcardSettings: {},
  renderingContext,
};

export const StartsBelowZeroEndsAbove = Template.bind({});
StartsBelowZeroEndsAbove.args = {
  rawSeries: data.startsBelowZeroEndsAbove as any,
  dashcardSettings: {},
  renderingContext,
};

export const StartsAboveZeroCrossesEndsAbove = Template.bind({});
StartsAboveZeroCrossesEndsAbove.args = {
  rawSeries: data.startsAboveZeroCrossesEndsAbove as any,
  dashcardSettings: {},
  renderingContext,
};

export const StartsBelowZeroCrossesEndsBelow = Template.bind({});
StartsBelowZeroCrossesEndsBelow.args = {
  rawSeries: data.startsBelowZeroCrossesEndsBelow as any,
  dashcardSettings: {},
  renderingContext,
};

export const CustomColors = Template.bind({});
CustomColors.args = {
  rawSeries: data.customColors as any,
  dashcardSettings: {},
  renderingContext,
};

export const NoTotalTimeseries = Template.bind({});
NoTotalTimeseries.args = {
  rawSeries: data.noTotalTimeseries as any,
  dashcardSettings: {},
  renderingContext,
};

export const NoTotalOrdinal = Template.bind({});
NoTotalOrdinal.args = {
  rawSeries: data.noTotalOrdinal as any,
  dashcardSettings: {},
  renderingContext,
};

export const DataLabels = Template.bind({});
DataLabels.args = {
  rawSeries: data.dataLabels as any,
  dashcardSettings: {},
  renderingContext,
};

export const DataLabelsColumnFormatting = Template.bind({});
DataLabelsColumnFormatting.args = {
  rawSeries: data.dataLabelsColumnFormatting as any,
  dashcardSettings: {},
  renderingContext,
};

export const DataLabelsTimeseries = Template.bind({});
DataLabelsTimeseries.args = {
  rawSeries: data.dataLabelsTimeseries as any,
  dashcardSettings: {},
  renderingContext,
};

export const DataLabelsMixed = Template.bind({});
DataLabelsMixed.args = {
  rawSeries: data.dataLabelsMixed as any,
  dashcardSettings: {},
  renderingContext,
};

export const PowYScale = Template.bind({});
PowYScale.args = {
  rawSeries: data.powYScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const PowYScaleNegativeOnly = Template.bind({});
PowYScaleNegativeOnly.args = {
  rawSeries: data.powYScaleNegativeOnly as any,
  dashcardSettings: {},
  renderingContext,
};

export const PowYScaleMixed = Template.bind({});
PowYScaleMixed.args = {
  rawSeries: data.powYScaleMixed as any,
  dashcardSettings: {},
  renderingContext,
};

export const LogYScale = Template.bind({});
LogYScale.args = {
  rawSeries: data.logYScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const LogYScaleNegative = Template.bind({});
LogYScaleNegative.args = {
  rawSeries: data.logYScaleNegative as any,
  dashcardSettings: {},
  renderingContext,
};

export const NativeTimeSeriesQuarter = Template.bind({});
NativeTimeSeriesQuarter.args = {
  rawSeries: data.nativeTimeSeriesQuarter as any,
  dashcardSettings: {},
  renderingContext,
};

export const NativeTimeSeriesWithGaps = Template.bind({});
NativeTimeSeriesWithGaps.args = {
  rawSeries: data.nativeTimeSeriesWithGaps as any,
  dashcardSettings: {},
  renderingContext,
};

export const StructuredTimeSeriesYear = Template.bind({});
StructuredTimeSeriesYear.args = {
  rawSeries: data.structuredTimeSeriesYear as any,
  dashcardSettings: {},
  renderingContext,
};

export const TimeXScaleTwoBarsWithoutTotal = Template.bind({});
TimeXScaleTwoBarsWithoutTotal.args = {
  rawSeries: data.timeXScaleTwoBarsWithoutTotal as any,
  dashcardSettings: {},
  renderingContext,
};

export const EnourmousDataset = Template.bind({});
EnourmousDataset.args = {
  rawSeries: data.enormousDataset as any,
  dashcardSettings: {},
  renderingContext,
};

export const Nulls = Template.bind({});
Nulls.args = {
  rawSeries: data.nulls as any,
  dashcardSettings: {},
  renderingContext,
};

export const NullXAxisValue = Template.bind({});
NullXAxisValue.args = {
  rawSeries: data.nullXAxisValue as any,
  dashcardSettings: {},
  renderingContext,
};

export const LinearNullDimension = Template.bind({});
LinearNullDimension.args = {
  rawSeries: data.linearNullDimension as any,
  dashcardSettings: {},
  renderingContext,
};

export const OrdinalNullDimension = Template.bind({});
OrdinalNullDimension.args = {
  rawSeries: data.ordinalNullDimension as any,
  dashcardSettings: {},
  renderingContext,
};

export const TwoBarsWithTotal = Template.bind({});
TwoBarsWithTotal.args = {
  rawSeries: data.twoBarsWithTotal as any,
  dashcardSettings: {},
  renderingContext,
};
