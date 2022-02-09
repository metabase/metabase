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

export const WithClearBehavior = Template.bind({});

WithClearBehavior.args = {
  children: "Some value is selected",
  hasValue: true,
  onClear: () => {
    return;
  },
  fullWidth: false,
};
