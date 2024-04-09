import { action } from "@storybook/addon-actions";
import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";

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
    onClose: { action: "onClose" },
    onBack: { action: "onBack" },
  },
};

const Template: ComponentStory<typeof ModalContent> = args => {
  return (
    <div
      style={{
        width: 1200,
        background: color("white"),
        border: "1px solid black",
      }}
    >
      <ModalContent {...args} />
    </div>
  );
};

const args = {
  id: "id",
  title: "Long Modal title Long Modal title Long Modal title Long Modal title",
  centeredTitle: false,
  children: <>Content</>,
  fullPageModal: false,
  onClose: action("onClose"),
  onBack: undefined,
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

export const WithBackButton = Template.bind({});
WithBackButton.args = {
  ...args,
  onBack: action("onBack"),
};
