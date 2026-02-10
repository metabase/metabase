import { action } from "storybook/actions";

import { ReduxProvider } from "__support__/storybook";
import { Flex } from "metabase/ui";

import { UpsellCardInner, type UpsellCardProps } from "./UpsellCard";

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

const Wrapper = (args: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) => {
  return (
    <ReduxProvider>
      <Flex justify="center" style={args.style}>
        {args.children}
      </Flex>
    </ReduxProvider>
  );
};

const DefaultTemplate = (args: UpsellCardProps) => (
  <Wrapper>
    <UpsellCardInner {...args} />
  </Wrapper>
);

export default {
  title: "Patterns/Upsells/Card",
  component: UpsellCardInner,
  args,
  argTypes,
};

export const WithOnClick = {
  render: DefaultTemplate,
  args: { ...args, onClick: action("clicked") },
};

export const WithImage = {
  render: DefaultTemplate,
};

export const WithoutImage = {
  render: DefaultTemplate,
  args: { ...args, illustrationSrc: null },
};

export const MaxWidth500Variant = {
  render: DefaultTemplate,
  args: { ...args, maxWidth: 500 },
};

export const FullWidthVariant = {
  render: DefaultTemplate,
  args: { ...args, fullWidth: true },
};

export const LargeVariant = {
  render: DefaultTemplate,
  args: { ...args, large: true },
};

export const LargeFullWidthVariant = {
  render: DefaultTemplate,
  args: { ...args, large: true, fullWidth: true, maxWidth: 800 },
};
