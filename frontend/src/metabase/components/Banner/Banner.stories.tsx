import { action } from "@storybook/addon-actions";
import type { Meta } from "@storybook/react";

import { Text } from "metabase/ui";

import { Banner, type BannerProps } from "./Banner";

export default {
  title: "components/Banner",
  component: Banner,
  tags: ["autodocs"],
} satisfies Meta<BannerProps>;

export const Default = {
  render: (args: BannerProps) => <Banner {...args} />,
  args: {
    icon: "warning_round_filled",
    bg: "var(--mb-color-bg-black)",
    iconColor: "var(--mb-color-text-white)",
    body: (
      <Text lh="inherit" c="text-white">
        This is a banner
      </Text>
    ),
    closable: true,
    onClose: action("onClose"),
  },
  parameters: {
    docs: {
      description: {
        story: "A banner with an icon, a body, and a close button.",
      },
    },
  },
};
