import { ReduxProvider } from "__support__/storybook";
import { Flex } from "metabase/ui";

import { type UpsellCardProps, _UpsellCard } from "./UpsellCard";

const args = {
  title: "Ice Cream",
  buttonText: "Get Some",
  buttonLink: "https://www.metabase.com",
  campaign: "ice-cream",
  source: "ice-cream-page-footer",
  illustrationSrc: "https://i.imgur.com/789Q56R.png",
  children: "You wouldn't believe how great this stuff is.",
};

const argTypes = {
  children: {
    control: { type: "text" },
  },
  buttonText: {
    control: { type: "text" },
  },
  buttonLink: {
    control: { type: "text" },
  },
  illustrationSrc: {
    control: { type: "text" },
  },
  campaign: {
    control: { type: "text" },
  },
  source: {
    control: { type: "text" },
  },
  large: {
    control: { type: "boolean" },
  },
  maxWidth: {
    control: { type: "number" },
  },
  fullWidth: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = (args: UpsellCardProps) => (
  <ReduxProvider>
    <Flex justify="center">
      <_UpsellCard {...args} />
    </Flex>
  </ReduxProvider>
);

export default {
  title: "Upsells/Card",
  component: _UpsellCard,
  args,
  argTypes,
};

export const WithImage = {
  render: DefaultTemplate,
};

export const WithoutImage = {
  render: DefaultTemplate,
  args: { ...args, illustrationSrc: null },
};

export const LargeVariant = {
  render: DefaultTemplate,
  args: { ...args, large: true },
};

export const MaxWidth500Variant = {
  render: DefaultTemplate,
  args: { ...args, maxWidth: 500 },
};

export const FullWidthVariant = {
  render: DefaultTemplate,
  args: { ...args, fullWidth: true },
};

export const LargeMaxWidth500Variant = {
  render: DefaultTemplate,
  args: { ...args, large: true, maxWidth: 500 },
};

export const LargeFullWidthVariant = {
  render: DefaultTemplate,
  args: { ...args, large: true, fullWidth: true },
};
