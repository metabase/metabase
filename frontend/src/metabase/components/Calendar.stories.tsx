import React from "react";
import { ComponentStory } from "@storybook/react";
import Calendar from "./Calendar";

export default {
  title: "Core/Calendar",
  component: Calendar,
};

const Template: ComponentStory<typeof Calendar> = args => {
  return <Calendar {...args} />;
};

export const Default = Template.bind({});
Default.args = {};
