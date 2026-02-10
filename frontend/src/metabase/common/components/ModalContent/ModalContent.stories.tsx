import type { StoryFn } from "@storybook/react-webpack5";
import { action } from "storybook/actions";

import { color } from "metabase/lib/colors";

import {
  ModalContent,
  ModalContentActionIcon,
  type ModalContentProps,
} from "./index";

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

const Template: StoryFn<ModalContentProps> = (args) => {
  return (
    <div
      style={{
        width: 1200,
        background: color("background-primary"),
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

export const Default = {
  render: Template,

  args: {
    ...args,
  },
};

export const WithHeaderActions = {
  render: Template,

  args: {
    ...args,
    headerActions: (
      <>
        <ModalContentActionIcon name="pencil" onClick={action("Action1")} />
      </>
    ),
  },
};

export const WithBackButton = {
  render: Template,

  args: {
    ...args,
    onBack: action("onBack"),
  },
};
