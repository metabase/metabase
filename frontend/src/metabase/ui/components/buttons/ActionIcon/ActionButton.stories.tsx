import { Icon } from "../../";

import { ActionIcon, type ActionIconProps } from "./";

export default {
  title: "Components/Buttons/ActionIcon",
  component: ActionIcon,
  argTypes: {
    color: {
      control: {
        type: "select",
        options: ["brand"],
      },
    },
    disabled: {
      control: {
        type: "boolean",
      },
    },
    size: {
      control: {
        type: "select",
        options: ["xs", "sm", "md", "lg", "xl"],
      },
    },
    variant: {
      control: {
        type: "select",
        options: ["filled", "subtle", "viewFooter", "viewHeader"],
      },
    },
  },
};

export const Default = {
  render: (args: ActionIconProps) => (
    <ActionIcon {...args}>
      <Icon name="ai" />
    </ActionIcon>
  ),
  args: {
    color: "brand",
    size: "md",
    variant: "filled",
    disabled: false,
  },
};
