import type { Meta, StoryObj } from "@storybook/react";

import { Flex } from "metabase/ui";

import { MetabotAttachment } from "./MetabotAttachment";

const meta: Meta<typeof MetabotAttachment> = {
  title: "App/Metabot/Attachments",
  component: MetabotAttachment,
  args: { filename: "Bird sightings.csv", size: 24576, onRemove: () => {} },
};

export default meta;
type Story = StoryObj<typeof MetabotAttachment>;

export const Staged: Story = {};
export const Uploading: Story = { args: { uploading: true, disabled: true } };
export const Saved: Story = {
  args: {
    attachment: {
      card_id: 12,
      filename: "Bird sightings.csv",
      size: 24576,
      media_type: "text/csv",
    },
  },
};
export const NarrowSidebar: Story = {
  render: (args) => (
    <Flex w={280} gap="xs" wrap="wrap">
      {Array.from({ length: 5 }, (_, index) => (
        <MetabotAttachment
          {...args}
          key={index}
          filename={`A very long filename for bird sightings ${index + 1}.csv`}
        />
      ))}
    </Flex>
  ),
};
