import type { ComponentStory } from "@storybook/react";

import Toaster from "./Toaster";

export default {
  title: "Dashboard/Toaster",
  component: Toaster,
};

const Template: ComponentStory<typeof Toaster> = args => {
  return <Toaster {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  message: "Would you like to be notified when this dashboard is done loading?",
  isShown: true,
  onConfirm: () => {
    alert("Confirmed");
  },
  onDismiss: () => {
    alert("Dismissed");
  },
};

export const SuccessToast = Template.bind({});
SuccessToast.args = {
  message: "Operation completed successfully!",
  isShown: true,
  className: "bg-success text-white",
  onConfirm: () => {
    alert("Confirmed");
  },
  onDismiss: () => {
    alert("Dismissed");
  },
};

export const ErrorToast = Template.bind({});
ErrorToast.args = {
  message: "An error occurred. Please try again.",
  isShown: true,
  className: "bg-error text-white",
  onConfirm: () => {
    alert("Confirmed");
  },
  onDismiss: () => {
    alert("Dismissed");
  },
};
