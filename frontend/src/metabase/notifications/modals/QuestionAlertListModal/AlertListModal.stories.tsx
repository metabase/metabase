import type { StoryFn } from "@storybook/react-webpack5";
import { type ComponentProps, useState } from "react";
import { action } from "storybook/actions";

import {
  createMockNotification,
  createMockNotificationHandlerEmail,
  createMockNotificationHandlerSlack,
} from "metabase-types/api/mocks/notification";

import { AlertListModal } from "./AlertListModal";

export default {
  title: "Notifications/AlertListModal",
  component: AlertListModal,
};

const Template: StoryFn<ComponentProps<typeof AlertListModal>> = (args) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <AlertListModal
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
