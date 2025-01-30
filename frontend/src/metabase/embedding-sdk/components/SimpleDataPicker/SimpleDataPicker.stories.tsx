import { action } from "@storybook/addon-actions";
import type { Meta, StoryObj } from "@storybook/react";

import { Popover } from "metabase/ui";

import { SimpleDataPicker } from "./SimpleDataPicker";

const meta: Meta<typeof SimpleDataPicker> = {
  title: "embedding/SimpleDataPicker",
  component: SimpleDataPicker,
  args: {
    onClick: action("on-click"),
    options: [
      {
        id: 1,
        display_name: "Accounts",
      },
      {
        id: 2,
        display_name: "Orders",
      },
    ],
  },
  render: args => {
    return (
      <Popover opened>
        <Popover.Dropdown>
          <SimpleDataPicker {...args} />
        </Popover.Dropdown>
      </Popover>
    );
  },
};

export default meta;

type Story = StoryObj<typeof SimpleDataPicker>;

export const WithoutPopover: Story = {
  render: args => <SimpleDataPicker {...args} />,
};

export const Primary: Story = {};
