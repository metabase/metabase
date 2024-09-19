import type { StoryObj } from "@storybook/react";

import SlackStatus from "./SlackStatus";

export default {
  title: "Admin/Settings/Slack/SlackStatus",
  component: SlackStatus,
  argTypes: {
    Form: { table: { disable: true } },
    onDelete: { action: "onDelete" },
  },
};

export const Default: StoryObj<typeof SlackStatus> = {
  render: args => {
    return <SlackStatus {...args} />;
  },

  args: {
    Form: () => <div />,
    isValid: true,
  },
};
