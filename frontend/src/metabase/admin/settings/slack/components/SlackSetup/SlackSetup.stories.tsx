import type { StoryObj } from "@storybook/react";

import SlackSetup from "./SlackSetup";

export default {
  title: "Admin/Settings/Slack/SlackSetup",
  component: SlackSetup,
  argTypes: {
    Form: { table: { disable: true } },
    onSubmit: { action: "onSubmit" },
  },
};

export const Default: StoryObj<typeof SlackSetup> = {
  render: args => {
    return <SlackSetup {...args} />;
  },

  args: {
    Form: () => <div />,
    manifest: "app: token",
    isBot: false,
    isValid: true,
  },
};
