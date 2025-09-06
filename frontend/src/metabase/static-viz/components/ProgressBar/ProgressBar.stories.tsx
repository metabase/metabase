import type { StoryFn } from "@storybook/react";

import type { StaticChartProps } from "../StaticVisualization/types";

import { ProgressBar } from "./ProgressBar";
import { BELOW_GOAL, EXCEEDS_GOAL, REACHED_GOAL, ZERO } from "./stories-data";

export default {
  title: "Viz/Static Viz/ProgressBar",
  component: ProgressBar,
};

const Template: StoryFn<StaticChartProps> = (args) => {
  return <ProgressBar {...args} />;
};

export const Default = {
  render: Template,
  args: ZERO,
};

export const BelowGoal = {
  render: Template,
  args: BELOW_GOAL,
};

export const ReachedGoal = {
  render: Template,
  args: REACHED_GOAL,
};

export const ExceedsGoal = {
  render: Template,
  args: EXCEEDS_GOAL,
};

export const Watermark = {
  render: Template,
  args: { ...EXCEEDS_GOAL, hasDevWatermark: true },
};
