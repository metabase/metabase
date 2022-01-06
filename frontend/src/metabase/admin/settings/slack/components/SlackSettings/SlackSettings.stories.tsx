import React from "react";
import { ComponentStory } from "@storybook/react";
import SlackSettings from "./SlackSettings";

export default {
  title: "Admin/Settings/Slack/SlackSettings",
  component: SlackSettings,
  argTypes: {
    Form: { table: { disable: true } },
    onSubmit: { action: "onSubmit" },
  },
};

export const Default: ComponentStory<typeof SlackSettings> = args => {
  return <SlackSettings {...args} />;
};

Default.args = {
  Form: () => <div />,
};
