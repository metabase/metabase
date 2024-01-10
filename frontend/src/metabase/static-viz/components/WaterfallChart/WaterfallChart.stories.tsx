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

export const WithoutTotal = Template.bind({});
WithoutTotal.args = {
  rawSeries: data.withoutTotal as any,
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
