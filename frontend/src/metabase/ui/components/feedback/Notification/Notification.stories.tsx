import { Notification, type NotificationProps } from "metabase/ui";

const args = {
  children: "Get notified when new data is available for your dashboards.",
  withCloseButton: true,
  withBorder: false,
};

const argTypes = {
  children: {
    control: { type: "text" },
  },
  withCloseButton: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = (args: NotificationProps) => {
  return <Notification {...args} />;
};

export default {
  title: "Components/Feedback/Notification",
  component: Notification,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  args: {
    title: "Your changes have been saved successfully.",
    withCloseButton: false,
  },
};
