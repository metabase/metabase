import React from "react";
import { ComponentStory } from "@storybook/react";
import SlackStatus from "./SlackStatus";

export default {
  title: "Admin/Settings/Slack/SlackStatus",
  component: SlackStatus,
  argTypes: {
    StatusForm: { table: { disable: true } },
    onDelete: { action: "onDelete" },
  },
};

export const Default: ComponentStory<typeof SlackStatus> = args => {
  return <SlackStatus {...args} />;
};

Default.args = {
  StatusForm: () => <div />,
  hasSlackError: false,
};
