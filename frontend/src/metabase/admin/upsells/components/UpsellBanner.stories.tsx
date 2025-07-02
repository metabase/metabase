import { action } from "@storybook/addon-actions";
import type { ComponentProps } from "react";

import { ReduxProvider } from "__support__/storybook";
import ExternalLink from "metabase/common/components/ExternalLink";
import { Box } from "metabase/ui";

import { _UpsellBanner } from "./UpsellBanner";
import S from "./Upsells.module.css";

const args = {
  children: "Discover the power of Metabase Enterprise.",
  buttonLink: "https://www.metabase.com",
  buttonText: "Try for free",
  campaign: "upsell-banner",
  source: "storybook",
  title: "Upgrade now",
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
};

type UpsellBannerProps = ComponentProps<typeof _UpsellBanner>;

const DefaultTemplate = (args: UpsellBannerProps) => (
  <ReduxProvider>
    <Box>
      <_UpsellBanner {...args} />
    </Box>
  </ReduxProvider>
);

const SecondaryTemplate = ({ children, ...args }: UpsellBannerProps) => (
  <ReduxProvider>
    <Box>
      <_UpsellBanner {...args}>
        {children}
        <ExternalLink
          className={S.SecondaryCTALink}
          href="https://www.metabase.com/docs"
        >
          Learn more
        </ExternalLink>
      </_UpsellBanner>
    </Box>
  </ReduxProvider>
);

export default {
  title: "Patterns/Upsells/Banner",
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

export const Dismissible = {
  render: (args: UpsellBannerProps) => (
    <ReduxProvider>
      <Box>
        <_UpsellBanner {...args} dismissible />
      </Box>
    </ReduxProvider>
  ),
  args: {
    ...args,
    onDismiss: action("dismiss"),
  },
};
