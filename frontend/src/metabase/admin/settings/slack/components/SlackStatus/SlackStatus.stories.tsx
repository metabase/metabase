import React from "react";
import type { ComponentStory } from "@storybook/react";
import SlackStatus from "./SlackStatus";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Admin/Settings/Slack/SlackStatus",
  component: SlackStatus,
  argTypes: {
    Form: { table: { disable: true } },
    onDelete: { action: "onDelete" },
  },
};

export const Default: ComponentStory<typeof SlackStatus> = args => {
  return <SlackStatus {...args} />;
};

Default.args = {
  // eslint-disable-next-line react/display-name
  Form: () => <div />,
  isValid: true,
};
