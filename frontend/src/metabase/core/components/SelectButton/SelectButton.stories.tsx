import React from "react";
import { ComponentStory } from "@storybook/react";
import SelectButton from "./SelectButton";

export default {
  title: "Core/SelectButton",
  component: SelectButton,
};

const Template: ComponentStory<typeof SelectButton> = args => {
  return <SelectButton {...args} />;
};

export const Default = Template.bind({});

Default.args = {
  children: "Select an option",
  hasValue: false,
  fullWidth: false,
};
