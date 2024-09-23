import type { StoryFn } from "@storybook/react";

import HelpCard from "./HelpCard";

export default {
  title: "Components/HelpCard",
  component: HelpCard,
};

const Template: StoryFn<typeof HelpCard> = args => {
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
