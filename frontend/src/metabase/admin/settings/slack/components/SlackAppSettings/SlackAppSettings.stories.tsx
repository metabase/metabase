import React from "react";
import { ComponentStory } from "@storybook/react";
import SlackAppSettings from "./SlackAppSettings";

export default {
  title: "Admin/Settings/Slack/SlackAppSettings",
  component: SlackAppSettings,
  argTypes: {
    Form: { table: { disable: true } },
    onSubmit: { action: "onSubmit" },
  },
};

export const Default: ComponentStory<typeof SlackAppSettings> = args => {
  return <SlackAppSettings {...args} />;
};

Default.args = {
  Form: () => <div />,
};
