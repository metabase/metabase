import type { StoryFn } from "@storybook/react-webpack5";

import {
  DEFAULT,
  DUPLICATED_STEPS,
} from "metabase/static-viz/components/FunnelChart/stories-data";

import FunnelChart, { type FunnelProps } from "./FunnelChart";

export default {
  title: "Viz/Static Viz/FunnelChart",
  component: FunnelChart,
};

const Template: StoryFn<FunnelProps> = (args) => {
  return <FunnelChart {...args} />;
};

export const Default = {
  render: Template,
  args: { ...DEFAULT },
};

export const WithDuplicatedSteps = {
  render: Template,
  args: DUPLICATED_STEPS,
};

export const Watermark = {
  render: Template,
  args: { ...DEFAULT, hasDevWatermark: true },
};
