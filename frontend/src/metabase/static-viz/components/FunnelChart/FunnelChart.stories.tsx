import type { ComponentStory } from "@storybook/react";

import {
  DEFAULT,
  DUPLICATED_STEPS,
} from "metabase/static-viz/components/FunnelChart/stories-data";

import FunnelChart from "./FunnelChart";

export default {
  title: "static-viz/FunnelChart",
  component: FunnelChart,
};

const Template: ComponentStory<typeof FunnelChart> = args => {
  return <FunnelChart {...args} />;
};

export const Default = Template.bind({});
Default.args = DEFAULT;

export const WithDuplicatedSteps = Template.bind({});
WithDuplicatedSteps.args = DUPLICATED_STEPS;
