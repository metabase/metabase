import React from "react";
import { ComponentStory } from "@storybook/react";
import DeprecationBanner from "./DeprecationBanner";

export default {
  title: "Admin/App/DeprecationBanner",
  component: DeprecationBanner,
  argTypes: {
    onClose: { action: "DeprecationBanner" },
  },
};

export const Default: ComponentStory<typeof DeprecationBanner> = args => {
  return <DeprecationBanner {...args} />;
};

Default.args = {
  hasSlackBot: true,
  hasDeprecatedDatabase: true,
  isEnabled: true,
};
