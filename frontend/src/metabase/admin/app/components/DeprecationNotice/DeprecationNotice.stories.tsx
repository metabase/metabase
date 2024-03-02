import type { ComponentStory } from "@storybook/react";

import DeprecationNotice from "./DeprecationNotice";

export default {
  title: "Admin/App/DeprecationNotice",
  component: DeprecationNotice,
  argTypes: {
    onClose: { action: "DeprecationNotice" },
  },
};

export const Default: ComponentStory<typeof DeprecationNotice> = args => {
  return <DeprecationNotice {...args} />;
};

Default.args = {
  hasSlackBot: true,
  hasDeprecatedDatabase: true,
  isEnabled: true,
};
