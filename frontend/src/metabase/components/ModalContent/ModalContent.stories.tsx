import type { ComponentStory } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import Modal from "metabase/components/Modal";
import ModalContent, { ModalContentActionIcon } from "./index";

export default {
  title: "Components/ModalContent",
  component: ModalContent,
  argTypes: {
    children: {
      table: {
        disable: true,
      },
    },
    headerActions: {
      table: {
        disable: true,
      },
    },
  },
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
  headerActions: (
    <>
      <ModalContentActionIcon name="pencil" onClick={action("Action1")} />
    </>
  ),
};
