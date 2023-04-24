import React from "react";
import type { ComponentStory } from "@storybook/react";
import Alert from "./Alert";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/Alert",
  component: Alert,
};

const Template: ComponentStory<typeof Alert> = args => {
  return <Alert {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  children: "Info alert",
  icon: "info",
};

export const Warning = Template.bind({});
Warning.args = {
  children: "Warning alert",
  variant: "warning",
  icon: "warning",
};

export const Error = Template.bind({});
Error.args = {
  children: "Error alert",
  variant: "error",
  icon: "warning",
};
