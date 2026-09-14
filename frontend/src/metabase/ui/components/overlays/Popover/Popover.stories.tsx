import type { StoryFn } from "@storybook/react";

import {
  Box,
  Button,
  Flex,
  Menu,
  Popover,
  type PopoverProps,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { StorySection, StoryShowcase } from "metabase/ui/stories/showcase";

const args = {
  label: "Popover",
  position: "bottom",
};

const argTypes = {
  position: {
    options: [
      "bottom",
      "left",
      "right",
      "top",
      "bottom-end",
      "bottom-start",
      "left-end",
      "left-start",
      "right-end",
      "right-start",
      "top-end",
      "top-start",
    ],
    control: { type: "select" },
  },
};

const sampleArgs = {
  simple: <Text>Popover!</Text>,
  interactive: (
    <Stack gap="sm">
      <TextInput autoFocus placeholder="First name" />
      <TextInput placeholder="Last name" />
      <Button>Update</Button>
    </Stack>
  ),
};

const DefaultTemplate = ({
  children,
  ...args
}: { children: React.ReactNode } & PopoverProps) => (
  <Flex justify="center">
    <Popover {...args}>
      <Popover.Target>
        <Button variant="filled">Click to open</Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Box p="md">{children}</Box>
      </Popover.Dropdown>
    </Popover>
  </Flex>
);

// make the stories viewport independent by disabling middlewares
const OVERVIEW_MIDDLEWARES = { shift: false, flip: false, size: false };

const OverviewCell = ({ children }: { children: React.ReactNode }) => (
  <Flex align="flex-start" justify="center" w={400} h={200}>
    {children}
  </Flex>
);

const OverviewTemplate: StoryFn<PopoverProps> = () => (
  <StoryShowcase title="Popover">
    <StorySection title="Default">
      <OverviewCell>
        <Popover
          opened
          withinPortal={false}
          position="bottom"
          middlewares={OVERVIEW_MIDDLEWARES}
        >
          <Popover.Target>
            <Button variant="filled">Target</Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Box p="md" w={300}>
              <Text>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed
              </Text>
            </Box>
          </Popover.Dropdown>
        </Popover>
      </OverviewCell>
    </StorySection>

    <StorySection title="Menu dropdown">
      <OverviewCell>
        <Menu
          opened
          withinPortal={false}
          position="bottom"
          middlewares={OVERVIEW_MIDDLEWARES}
        >
          <Menu.Target>
            <Button variant="filled">Target</Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item>First item</Menu.Item>
            <Menu.Item>Second item</Menu.Item>
            <Menu.Item>Third item</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </OverviewCell>
    </StorySection>

    <StorySection
      title="Scrolling content"
      description="Long content scrolls inside the dropdown when a max height is set."
    >
      <OverviewCell>
        <Popover
          opened
          withinPortal={false}
          position="bottom"
          middlewares={OVERVIEW_MIDDLEWARES}
        >
          <Popover.Target>
            <Button variant="filled">Target</Button>
          </Popover.Target>
          <Popover.Dropdown mah={120}>
            <Stack gap="xs" p="md" w={344}>
              {Array.from({ length: 8 }, (_, index) => (
                <Text key={index}>Row {index + 1}</Text>
              ))}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </OverviewCell>
    </StorySection>
  </StoryShowcase>
);

export default {
  title: "Components/Overlays/Popover",
  component: Popover,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  args: {
    children: sampleArgs.simple,
  },
};

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    controls: { include: ["theme"] },
  },
};

export const InteractiveContent = {
  render: DefaultTemplate,
  name: "Interactive content",
  args: {
    children: sampleArgs.interactive,
  },
};

export const Opened = {
  render: DefaultTemplate,
  args: {
    children: sampleArgs.simple,
    opened: true,
  },
};
