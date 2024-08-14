import type { ComponentStory } from "@storybook/react";

import SlackStatus from "./SlackStatus";

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
  Form: () => <div />,
  isValid: true,
};
