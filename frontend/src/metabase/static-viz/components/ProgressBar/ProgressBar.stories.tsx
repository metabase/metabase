import type { StoryFn } from "@storybook/react";

import ProgressBar, { type ProgressBarProps } from "./ProgressBar";
import { BELOW_GOAL, EXCEEDS_GOAL, REACHED_GOAL, ZERO } from "./stories-data";

export default {
  title: "static-viz/ProgressBar",
  component: ProgressBar,
};

const Template: StoryFn<ProgressBarProps> = args => {
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
