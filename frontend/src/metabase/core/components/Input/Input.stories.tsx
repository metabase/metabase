import React from "react";
import { ComponentStory } from "@storybook/react";
import Input from "./Input";

export default {
  title: "Core/Input",
  component: Input,
};

const Template: ComponentStory<typeof Input> = args => {
  return <Input {...args} />;
};

export const Default = Template.bind({});

export const WithError = Template.bind({});
WithError.args = {
  error: true,
};

export const WithHelperText = Template.bind({});
WithHelperText.args = {
  helperText: "Useful tips",
};
