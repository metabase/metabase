import type { StoryFn } from "@storybook/react";

import { HelpCard, type HelpCardProps } from "./HelpCard";

export default {
  title: "Components/HelpCard",
  component: HelpCard,
};

const Template: StoryFn<HelpCardProps> = (args) => {
  return <HelpCard {...args} />;
};

export const Default = {
  render: Template,

  args: {
    title: "Need help with anything?",
    helpUrl: "https://metabase.com",
    children:
      "See our docs for step-by-step directions on how to do what you need.",
  },
};
