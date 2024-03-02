import type { ComponentStory } from "@storybook/react";

import {
  CATEGORICAL,
  TIMESERIES,
} from "metabase/static-viz/components/WaterfallChart/stories-data";

import WaterfallChart from "./WaterfallChart";

export default {
  title: "static-viz/WaterfallChart",
  component: WaterfallChart,
};

const Template: ComponentStory<typeof WaterfallChart> = args => {
  return <WaterfallChart {...args} />;
};

export const Timeseries = Template.bind({});
Timeseries.args = TIMESERIES as any;

export const Categorical = Template.bind({});
Categorical.args = CATEGORICAL as any;
