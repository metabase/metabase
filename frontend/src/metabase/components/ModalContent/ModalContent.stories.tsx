import React from "react";
import type { ComponentStory } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import Modal from "metabase/components/Modal";
import ModalContent from "./ModalContent";

export default {
  title: "Components/ModalContent",
  component: ModalContent,
};

const Template: ComponentStory<typeof ModalContent> = args => {
  return (
    <Modal>
      <ModalContent {...args} />
    </Modal>
  );
};

const args = {
  id: "id",
  title: "Long Modal title Long Modal title Long Modal title Long Modal title",
  centeredTitle: false,
  children: <>Content</>,
  fullPageModal: false,
  onClose: action("onClose"),
};

export const Default = Template.bind({});
Default.args = {
  ...args,
};

export const WithHeaderActions = Template.bind({});
WithHeaderActions.args = {
  ...args,
  headerActions: [
    {
      icon: "pencil",
      onClick: action("Action1"),
    },
    {
      icon: "bolt",
      onClick: action("Action2"),
    },
  ],
};
