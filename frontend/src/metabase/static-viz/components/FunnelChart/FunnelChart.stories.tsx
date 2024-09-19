import type { StoryFn } from "@storybook/react";

import {
  DEFAULT,
  DUPLICATED_STEPS,
} from "metabase/static-viz/components/FunnelChart/stories-data";

import FunnelChart from "./FunnelChart";

export default {
  title: "static-viz/FunnelChart",
  component: FunnelChart,
};

const Template: StoryFn<typeof FunnelChart> = args => {
  return <FunnelChart {...args} />;
};

export const Default = {
  render: Template,
  args: DEFAULT,
};

export const WithDuplicatedSteps = {
  render: Template,
  args: DUPLICATED_STEPS,
};
