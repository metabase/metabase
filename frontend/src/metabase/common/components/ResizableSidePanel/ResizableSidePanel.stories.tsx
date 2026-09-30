import type { Meta, StoryObj } from "@storybook/react";

import { Box, Flex, Text } from "metabase/ui";

import { ResizableSidePanel } from "./ResizableSidePanel";

export default {
  title: "components/ResizableSidePanel",
  component: ResizableSidePanel,
  tags: ["autodocs"],
} satisfies Meta<typeof ResizableSidePanel>;

type Story = StoryObj<typeof ResizableSidePanel>;

const PanelContent = ({ label }: { label: string }) => (
  <Box bg="background-secondary" p="md" w="100%" h="100%">
    <Text fw="bold">{label}</Text>
    <Text c="text-secondary">Drag the inner edge to resize.</Text>
  </Box>
);

export const LeftPanel: Story = {
  render: (args) => (
    <Flex h={320} bd="1px solid border">
      <ResizableSidePanel
        storageKey="storybook-left-panel"
        side="left"
        defaultSize={args.defaultSize}
        maxSize={args.maxSize}
      >
        <PanelContent label="Left panel" />
      </ResizableSidePanel>
      <Box p="md" style={{ flex: 1 }}>
        <Text>Main content</Text>
      </Box>
    </Flex>
  ),
};

export const RightPanel: Story = {
  render: (args) => (
    <Flex h={320} bd="1px solid border">
      <Box p="md" style={{ flex: 1 }}>
        <Text>Main content</Text>
      </Box>
      <ResizableSidePanel
        storageKey="storybook-right-panel"
        side="right"
        defaultSize={args.defaultSize}
        maxSize={args.maxSize}
      >
        <PanelContent label="Right panel" />
      </ResizableSidePanel>
    </Flex>
  ),
};

export const SmallDefault: Story = {
  ...LeftPanel,
  args: { defaultSize: "sm" },
};

export const LargeDefault: Story = {
  ...LeftPanel,
  args: { defaultSize: "lg" },
};

export const ExtraWideMax: Story = {
  ...LeftPanel,
  args: { defaultSize: "lg", maxSize: "xl" },
};
