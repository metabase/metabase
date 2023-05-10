import React from "react";
import type { ComponentStory } from "@storybook/react";
import Calendar from "./Calendar";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/Calendar",
  component: Calendar,
};

const Template: ComponentStory<typeof Calendar> = args => {
  return <Calendar {...args} />;
};

export const Default = Template.bind({});
Default.args = {};
