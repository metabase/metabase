import type { StoryObj } from "@storybook/react";

import DeprecationNotice, {
  type DeprecationNoticeProps,
} from "./DeprecationNotice";

export default {
  title: "Admin/App/DeprecationNotice",
  component: DeprecationNotice,
  argTypes: {
    onClose: { action: "DeprecationNotice" },
  },
};

export const Default: StoryObj<DeprecationNoticeProps> = {
  render: args => {
    return <DeprecationNotice {...args} />;
  },

  args: {
    hasSlackBot: true,
    hasDeprecatedDatabase: true,
    isEnabled: true,
  },
};
