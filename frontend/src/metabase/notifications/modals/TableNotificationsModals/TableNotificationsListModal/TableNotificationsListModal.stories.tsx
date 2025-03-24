import { action } from "@storybook/addon-actions";
import type { StoryFn } from "@storybook/react";
import { type ComponentProps, useState } from "react";

import {
  createMockNotification,
  createMockNotificationHandlerEmail,
  createMockNotificationHandlerSlack,
} from "metabase-types/api/mocks/notification";

import { TableNotificationsListModal } from "./TableNotificationsListModal";

export default {
  title: "Notifications/AlertListModal",
  component: TableNotificationsListModal,
};

const Template: StoryFn<
  ComponentProps<typeof TableNotificationsListModal>
> = args => {
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

const questionAlerts = [
  createMockNotification({
    handlers: [
      createMockNotificationHandlerEmail(),
      createMockNotificationHandlerSlack(),
    ],
  }),
];

export const Default = {
  render: Template,

  args: {
    questionAlerts,
    onCreate: action("onCreate"),
    onEdit: action("onEdit"),
    onClose: action("onClose"),
  },
};
