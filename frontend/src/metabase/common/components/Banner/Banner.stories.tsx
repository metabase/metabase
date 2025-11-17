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
    bg: "var(--mb-color-background-primary-inverse)",
    iconColor: "var(--mb-color-text-primary-inverse)",
    body: (
      <Text lh="inherit" c="text-primary-inverse">
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

export const NonClosable = {
  render: (args: BannerProps) => <Banner {...args} />,
  args: {
    closable: false,
    bg: "var(--mb-color-success)",
    body: (
      <Text lh="inherit" c="text-primary-inverse">
        This is a banner
      </Text>
    ),
    py: "md",
  },
};
