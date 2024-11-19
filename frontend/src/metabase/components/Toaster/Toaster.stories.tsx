import type { StoryFn } from "@storybook/react";

import Toaster, { type ToasterProps } from "./Toaster";

export default {
  title: "Dashboard/Toaster",
  component: Toaster,
};

const Template: StoryFn<ToasterProps> = args => {
  return <Toaster {...args} />;
};

export const Default = {
  render: Template,

  args: {
    message:
      "Would you like to be notified when this dashboard is done loading?",
    isShown: true,
    onConfirm: () => {
      alert("Confirmed");
    },
    onDismiss: () => {
      alert("Dismissed");
    },
  },
};
