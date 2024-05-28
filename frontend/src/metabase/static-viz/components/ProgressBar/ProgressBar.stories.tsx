import type { ComponentStory } from "@storybook/react";

import ProgressBar from "./ProgressBar";
import { BELOW_GOAL, EXCEEDS_GOAL, REACHED_GOAL, ZERO } from "./stories-data";

export default {
  title: "static-viz/ProgressBar",
  component: ProgressBar,
};

const Template: ComponentStory<typeof ProgressBar> = args => {
  return <ProgressBar {...args} />;
};

export const Default = Template.bind({});
Default.args = ZERO;

export const BelowGoal = Template.bind({});
BelowGoal.args = BELOW_GOAL;

export const ReachedGoal = Template.bind({});
ReachedGoal.args = REACHED_GOAL;

export const ExceedsGoal = Template.bind({});
ExceedsGoal.args = EXCEEDS_GOAL;
