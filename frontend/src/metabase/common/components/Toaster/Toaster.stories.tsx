import type { StoryFn } from "@storybook/react-webpack5";

import { Toaster, type ToasterProps } from "./Toaster";

export default {
  title: "App/Dashboard/Toaster",
  component: Toaster,
};

const Template: StoryFn<ToasterProps> = (args) => {
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
