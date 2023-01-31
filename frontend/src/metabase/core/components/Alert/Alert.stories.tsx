import React from "react";
import type { ComponentStory } from "@storybook/react";
import Alert from "./Alert";

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

export const Error = Template.bind({});
Error.args = {
  children: "Error alert",
  variant: "error",
  icon: "warning",
};
