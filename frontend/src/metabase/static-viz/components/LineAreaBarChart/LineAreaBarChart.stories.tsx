import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import {
  CATEGORICAL_LINE_BAR,
  LINE_BAR_AREA,
  LINE_TWO_BARS,
  SINGLE_SERIES_BAR,
  SINGLE_SERIES_MANY_BARS,
  TIMESERIES_WITH_NEGATIVE_DATA,
} from "metabase/static-viz/components/LineAreaBarChart/stories-data";

import LineAreaBarChart from "./LineAreaBarChart";

export default {
  title: "static-viz/LineAreaBarChart",
  component: LineAreaBarChart,
};

const Template: ComponentStory<typeof LineAreaBarChart> = args => {
  return <LineAreaBarChart {...args} />;
};

export const LineTwoBars = Template.bind({});
LineTwoBars.args = { ...LINE_TWO_BARS, getColor: color } as any;

export const LineBarArea = Template.bind({});
LineBarArea.args = { ...LINE_BAR_AREA, getColor: color } as any;

export const CategoricalLineBar = Template.bind({});
CategoricalLineBar.args = { ...CATEGORICAL_LINE_BAR, getColor: color } as any;

export const TimeseriesWithNegativeData = Template.bind({});
TimeseriesWithNegativeData.args = {
  ...TIMESERIES_WITH_NEGATIVE_DATA,
  getColor: color,
} as any;

export const SingleSeriesBar = Template.bind({});
SingleSeriesBar.args = { ...SINGLE_SERIES_BAR, getColor: color } as any;

export const SingleSeriesManyBars = Template.bind({});
SingleSeriesManyBars.args = {
  ...SINGLE_SERIES_MANY_BARS,
  getColor: color,
} as any;
