import type { StoryObj } from "@storybook/react";

import DeprecationNotice from "./DeprecationNotice";

export default {
  title: "Admin/App/DeprecationNotice",
  component: DeprecationNotice,
  argTypes: {
    onClose: { action: "DeprecationNotice" },
  },
};

export const Default: StoryObj<typeof DeprecationNotice> = {
  render: args => {
    return <DeprecationNotice {...args} />;
  },

  args: {
    hasSlackBot: true,
    hasDeprecatedDatabase: true,
    isEnabled: true,
  },
};
