import type { StoryFn } from "@storybook/react";

import Calendar from "./Calendar";

export default {
  title: "Core/Calendar",
  component: Calendar,
};

const Template: StoryFn<typeof Calendar> = args => {
  return <Calendar {...args} />;
};

export const Default = {
  render: Template,
  args: {},
};
