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
  name: "With Image",
};

export const WithoutImage = {
  render: DefaultTemplate,
  name: "Without Image",
  args: { ...args, illustrationSrc: null },
};
