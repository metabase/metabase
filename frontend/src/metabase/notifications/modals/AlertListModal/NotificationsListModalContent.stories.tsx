import { action } from "@storybook/addon-actions";
import type { StoryFn } from "@storybook/react";
import { type ComponentProps, useState } from "react";

import Modal from "metabase/components/Modal";
import { createMockNotification } from "metabase-types/api/mocks/notification";

import { NotificationsListModalContent } from "./NotificationsListModalContent";

export default {
  title: "Notifications/NotificationsListModalContent",
  component: NotificationsListModalContent,
};

const Template: StoryFn<
  ComponentProps<typeof NotificationsListModalContent>
> = args => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
      <NotificationsListModalContent {...args} />
    </Modal>
  );
};

const questionAlerts = [createMockNotification()];

export const Default = {
  render: Template,

  args: {
    questionAlerts,
    onCreate: action("onCreate"),
    onEdit: action("onEdit"),
    onClose: action("onClose"),
  },
};
