import React from "react";
import { ComponentStory } from "@storybook/react";
import SlackSetup from "./SlackSetup";

export default {
  title: "Admin/Settings/Slack/SlackSetup",
  component: SlackSetup,
  argTypes: {
    Form: { table: { disable: true } },
    onSubmit: { action: "onSubmit" },
  },
};

export const Default: ComponentStory<typeof SlackSetup> = args => {
  return <SlackSetup {...args} />;
};

Default.args = {
  // eslint-disable-next-line react/display-name
  Form: () => <div />,
  manifest: "app: token",
  isBot: false,
  isValid: true,
};
