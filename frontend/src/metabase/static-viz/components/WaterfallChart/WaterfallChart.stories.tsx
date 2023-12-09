import type { ComponentStory } from "@storybook/react";
import {
  CATEGORICAL,
  TIMESERIES,
} from "metabase/static-viz/components/WaterfallChart/stories-data";
import OldWaterfallChart from "./OldWaterfallChart";

export default {
  title: "static-viz/WaterfallChart",
  component: OldWaterfallChart,
};

const Template: ComponentStory<typeof OldWaterfallChart> = args => {
  return <OldWaterfallChart {...args} />;
};

export const Timeseries = Template.bind({});
Timeseries.args = TIMESERIES as any;

export const Categorical = Template.bind({});
Categorical.args = CATEGORICAL as any;
