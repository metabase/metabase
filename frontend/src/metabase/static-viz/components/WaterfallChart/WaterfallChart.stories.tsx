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
      <WaterfallChart {...args} />
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

export const UnaggregatedOrdinal2 = Template.bind({});
UnaggregatedOrdinal2.args = {
  rawSeries: data.unaggregatedOrdinal2 as any,
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
