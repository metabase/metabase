import type { ComponentStory } from "@storybook/react";

import { DEFAULT } from "metabase/static-viz/components/CategoricalDonutChart/stories-data";

import CategoricalDonutChart from "./CategoricalDonutChart";

export default {
  title: "static-viz/CategoricalDonutChart",
  component: CategoricalDonutChart,
};

const Template: ComponentStory<typeof CategoricalDonutChart> = args => {
  return <CategoricalDonutChart {...args} />;
};

export const Default = Template.bind({});
Default.args = DEFAULT;
