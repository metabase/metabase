import { action } from "@storybook/addon-actions";
import type { StoryFn } from "@storybook/react";
import { type ComponentProps, useState } from "react";

import {
  createMockAlertNotification,
  createMockNotificationHandlerEmail,
  createMockNotificationHandlerSlack,
} from "metabase-types/api/mocks/notification";

import { TableNotificationsListModal } from "./TableNotificationsListModal";

export default {
  title: "Notifications/TableNotificationsListModal",
  component: TableNotificationsListModal,
};

const Template: StoryFn<ComponentProps<typeof TableNotificationsListModal>> = (
  args,
) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <TableNotificationsListModal
      {...args}
      opened={isOpen}
      onClose={() => {
        args.onClose();
        setIsOpen(false);
      }}
    />
  );
};

const tableNotifications = [
  createMockAlertNotification({
    handlers: [
      createMockNotificationHandlerEmail(),
      createMockNotificationHandlerSlack(),
    ],
  }),
];

export const Default = {
  render: Template,

  args: {
    tableNotifications,
    onCreate: action("onCreate"),
    onEdit: action("onEdit"),
    onClose: action("onClose"),
  },
};
