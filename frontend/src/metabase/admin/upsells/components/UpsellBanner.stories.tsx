import type { ComponentProps } from "react";

import { ReduxProvider } from "__support__/storybook";
import { Box } from "metabase/ui";

import { _UpsellBanner } from "./UpsellBanner";

const args = {
  children: "Discover the power of Metabase Enterprise.",
  buttonLink: "https://www.metabase.com",
  campaign: "upsell-banner",
  source: "storybook",
  title: "Upgrade now",
  buttonText: "Try for free",
};

const argTypes = {
  children: {
    control: { type: "text" },
  },
  buttonLink: {
    control: { type: "text" },
  },
  buttonText: {
    control: { type: "text" },
  },
  campaign: {
    control: { type: "text" },
  },
  source: {
    control: { type: "text" },
  },
  title: {
    control: { type: "text" },
  },
  secondaryLink: {
    control: { type: "text" },
  },
};

type UpsellBannerProps = ComponentProps<typeof _UpsellBanner>;

const DefaultTemplate = (args: UpsellBannerProps) => (
  <ReduxProvider>
    <Box>
      <_UpsellBanner {...args} />
    </Box>
  </ReduxProvider>
);

const SecondaryTemplate = (args: UpsellBannerProps) => (
  <ReduxProvider>
    <Box>
      <_UpsellBanner secondaryLink="https://www.metabase.com/docs" {...args} />
    </Box>
  </ReduxProvider>
);

export default {
  title: "Upsells/Banner",
  component: _UpsellBanner,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const Secondary = {
  render: SecondaryTemplate,
};
