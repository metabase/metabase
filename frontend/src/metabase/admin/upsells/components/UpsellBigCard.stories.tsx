import { useState } from "react";

import { ReduxProvider } from "__support__/storybook";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Box, Modal } from "metabase/ui";

import { type UpsellBigCardProps, _UpsellBigCard } from "./UpsellBigCard";
import S from "./Upsells.module.css";

const args = {
  children:
    "Find and fix issues fast, with an overview of all errors and model caching logs.",
  buttonText: "Try for free",
  campaign: "upsell-big-card",
  source: "storybook",
  title: "Troubleshoot faster",
  illustrationSrc: "app/assets/img/upsell-performance-tools.png",
} as const;

const argTypes = {
  children: {
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

const DefaultTemplate = (args: Omit<UpsellBigCardProps, "onClick">) => (
  <ReduxProvider>
    <Box>
      <_UpsellBigCard {...args} buttonLink="https://www.metabase.com" />
    </Box>
  </ReduxProvider>
);

const SecondaryTemplate = ({
  children,
  buttonLink,
  ...args
}: Omit<UpsellBigCardProps, "onClick">) => (
  <ReduxProvider>
    <Box>
      <_UpsellBigCard {...args} buttonLink="https://www.metabase.com">
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

const ModalTemplate = ({
  children,
  ...args
}: Omit<UpsellBigCardProps, "buttonLink">) => {
  const [opened, setOpened] = useState(false);
  return (
    <ReduxProvider>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Hello, Storybook"
      >
        I am just a basic Mantine modal.
      </Modal>
      <Box>
        <_UpsellBigCard {...args} onClick={() => setOpened(true)}>
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
};

export default {
  title: "Patterns/Upsells/BigCard",
  component: _UpsellBigCard,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  parameters: {
    loki: { skip: true },
  },
};

export const Secondary = {
  render: SecondaryTemplate,
  parameters: {
    loki: { skip: true },
  },
};

export const ModalStory = {
  render: ModalTemplate,
  parameters: {
    loki: { skip: true },
  },
};
