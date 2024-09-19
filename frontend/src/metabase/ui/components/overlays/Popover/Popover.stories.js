/* eslint-disable react/prop-types */
import {
  Box,
  Button,
  Flex,
  Popover,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

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
    <Stack spacing="sm">
      <TextInput autoFocus placeholder="First name" />
      <TextInput placeholder="Last name" />
      <Button>Update</Button>
    </Stack>
  ),
};

const DefaultTemplate = ({ children, ...args }) => (
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

const Default = DefaultTemplate.bind({});
const Interactive = DefaultTemplate.bind({});

export default {
  title: "Overlays/Popover",
  component: Popover,
  args: args,
  argTypes: argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
  args: {
    children: sampleArgs.simple,
  },
};

export const InteractiveContent = {
  render: Interactive,
  name: "Interactive content",
  args: {
    children: sampleArgs.interactive,
  },
};
