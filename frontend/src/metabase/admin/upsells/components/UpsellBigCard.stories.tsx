import type { ComponentProps } from "react";

import { ReduxProvider } from "__support__/storybook";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Box } from "metabase/ui";

import { _UpsellBigCard } from "./UpsellBigCard";
import S from "./Upsells.module.css";

const args = {
  children:
    "Find and fix issues fast, with an overview of all errors and model caching logs.",
  buttonLink: "https://www.metabase.com",
  buttonText: "Try for free",
  campaign: "upsell-big-card",
  source: "storybook",
  title: "Troubleshoot faster",
  illustrationSrc: "app/assets/img/upsell-performance-tools.png",
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

type UpsellBigCardProps = ComponentProps<typeof _UpsellBigCard>;

const DefaultTemplate = (args: UpsellBigCardProps) => (
  <ReduxProvider>
    <Box>
      <_UpsellBigCard {...args} />
    </Box>
  </ReduxProvider>
);

const SecondaryTemplate = ({ children, ...args }: UpsellBigCardProps) => (
  <ReduxProvider>
    <Box>
      <_UpsellBigCard {...args}>
        {children}
        <ExternalLink
          className={S.SecondaryCTALink}
          href="https://www.metabase.com/docs"
        >
          Learn more
        </ExternalLink>
      </_UpsellBigCard>
    </Box>
  </ReduxProvider>
);

export default {
  title: "Upsells/BigCard",
  component: _UpsellBigCard,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const Secondary = {
  render: SecondaryTemplate,
};
