import type { StoryFn } from "@storybook/react";

import Alert from "./Alert";

export default {
  title: "Core/Alert",
  component: Alert,
};

const Template: StoryFn<typeof Alert> = args => {
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
