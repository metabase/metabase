import type { StoryFn } from "@storybook/react";

import { Alert, type AlertProps } from "./Alert";

export default {
  title: "Components/Ask Before Using/Alert",
  component: Alert,
};

const Template: StoryFn<AlertProps> = (args) => {
  return <Alert {...args} />;
};

export const Default = {
  render: Template,

  args: {
    children: "Info alert",
    icon: "info",
  },
};

export const Warning = {
  render: Template,

  args: {
    children: "Warning alert",
    variant: "warning",
    icon: "warning",
  },
};

export const Error = {
  render: Template,

  args: {
    children: "Error alert",
    variant: "error",
    icon: "warning",
  },
};

export const WithCloseButton = {
  render: Template,

  args: {
    children: "Alert with close button",
    icon: "info",
    onClose: () => alert("Alert closed"),
  },
};
