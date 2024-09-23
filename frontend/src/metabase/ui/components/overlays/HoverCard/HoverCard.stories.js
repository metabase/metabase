/* eslint-disable react/prop-types */
import {
  Box,
  Button,
  Flex,
  HoverCard,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

const args = {
  label: "HoverCard",
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
  simple: <Text>Hover!</Text>,
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
    <HoverCard {...args}>
      <HoverCard.Target>
        <Button variant="filled">Hover to open</Button>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Box p="md">{children}</Box>
      </HoverCard.Dropdown>
    </HoverCard>
  </Flex>
);

const Default = DefaultTemplate.bind({});
const Interactive = DefaultTemplate.bind({});

export default {
  title: "Overlays/HoverCard",
  component: HoverCard,
  args,
  argTypes,
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
