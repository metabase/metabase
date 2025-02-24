import type { StoryFn } from "@storybook/react";

import Calendar from "./Calendar";

export default {
  title: "Components/Ask Before Using/Calendar",
  component: Calendar,
};

const Template: StoryFn<typeof Calendar> = args => {
  return <Calendar {...args} />;
};

export const Default = {
  render: Template,
  args: {},
};
