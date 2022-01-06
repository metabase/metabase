import React from "react";
import { ComponentStory } from "@storybook/react";
import SlackStatus from "./SlackStatus";

export default {
  title: "Admin/Settings/Slack/SlackStatus",
  component: SlackStatus,
  argTypes: {
    onDelete: { action: "onDelete" },
  },
};

export const Default: ComponentStory<typeof SlackStatus> = args => {
  return <SlackStatus {...args} />;
};

Default.args = {
  token: "48192472398748923789423789JSAL",
  channel: "#metabase_files",
  isError: false,
};
