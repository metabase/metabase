import type { ComponentStory } from "@storybook/react";
import { color } from "metabase/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/static-viz/lib/text";
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
      <ScatterPlot {...args} />
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

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.default as any,
  dashcardSettings: {},
  renderingContext,
};

export const PowerXScale = Template.bind({});
PowerXScale.args = {
  rawSeries: data.powerXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const LogXScale = Template.bind({});
LogXScale.args = {
  rawSeries: data.logXScale as any,
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
