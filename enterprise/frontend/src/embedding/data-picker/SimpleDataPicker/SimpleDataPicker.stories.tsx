import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { action } from "storybook/actions";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { Popover } from "metabase/ui";

import { SimpleDataPickerView } from "./SimpleDataPickerView";

const SHORT_OPTIONS = createOptions([
  "Accounts",
  "Analytic Events",
  "Feedback",
  "Invoices",
]);

const LONG_OPTIONS = createOptions([
  "Accounts",
  "Analytic Events",
  "Feedback",
  "Invoices",
  "Orders",
  "People",
  "Products",
  "Reviews",
  "Accounts 2",
  "Analytic Events 2",
  "Feedback 2",
  "Invoices 2",
]);

const SUPER_LONG_OPTIONS = createOptions([
  "Accounts",
  "Analytic Events",
  "Feedback",
  "Invoices",
  "Orders",
  "People",
  "Products",
  "Reviews",
  "Accounts 2",
  "Analytic Events 2",
  "Feedback 2",
  "Invoices 2",
  "Orders 2",
  "People 2",
  "Products 2",
  "Reviews 2",
  "Accounts 3",
  "Analytic Events 3",
  "Feedback 3",
  "Invoices 3",
  "Orders 3",
  "People 3",
  "Products 3",
  "Reviews 3",
]);

function createOptions(optionNames: string[]): Option[] {
  return optionNames.map((name, index) => ({
    id: index + 1,
    name,
  }));
}
interface Option {
  id: number;
  name: string;
}

const meta: Meta<typeof SimpleDataPickerView> = {
  title: "embedding/SimpleDataPickerView",
  component: SimpleDataPickerView,
  args: {
    onClick: action("on-click"),
    options: SHORT_OPTIONS,
  },
  render: (args) => {
    return (
      <Popover opened trapFocus>
        <Popover.Dropdown>
          <SimpleDataPickerView {...args} />
        </Popover.Dropdown>
      </Popover>
    );
  },
  decorators: [CommonSdkStoryWrapper],
};

export default meta;

type Story = StoryObj<typeof SimpleDataPickerView>;

export const WithoutPopover: Story = {
  render: (args) => <SimpleDataPickerView {...args} />,
};

export const NoOptions: Story = {
  args: {
    options: [],
  },
};

export const ShortOptions: Story = {};

export const SelectedOption: Story = {
  args: {
    selectedEntity: 3,
  },
};

export const TenOptions: Story = {
  args: {
    options: LONG_OPTIONS.filter((_, index) => index < 10),
  },
};

export const LongOptions: Story = {
  args: {
    options: LONG_OPTIONS,
  },
};

export const SuperLongOptions: Story = {
  args: {
    options: SUPER_LONG_OPTIONS,
  },
};
