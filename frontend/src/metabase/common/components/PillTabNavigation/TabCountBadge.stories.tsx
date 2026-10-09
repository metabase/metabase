import type { Meta, StoryObj } from "@storybook/react";

import { TabCountBadge } from "./TabCountBadge";

const meta = {
  title: "components/PillTabNavigation/TabCountBadge",
  component: TabCountBadge,
  tags: ["autodocs"],
} satisfies Meta<typeof TabCountBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = { args: { count: { status: "loading" } } };
export const Loaded: Story = {
  args: { count: { status: "loaded", value: 137 } },
};
export const Zero: Story = { args: { count: { status: "loaded", value: 0 } } };
export const Error: Story = { args: { count: { status: "error" } } };
