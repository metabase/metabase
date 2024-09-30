import { Button, Flex, Icon, Text } from "metabase/ui";

import { Menu } from "./";

const args = {
  trigger: "click",
  position: "bottom",
  disabled: false,
  closeOnClickOutside: true,
  closeOnEscape: true,
  closeOnItemClick: true,
};

const argTypes = {
  trigger: {
    options: ["click", "hover"],
    control: { type: "inline-radio" },
  },
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
  width: {
    control: { type: "number" },
  },
  disabled: {
    control: { type: "boolean" },
  },
  openDelay: {
    control: { type: "number" },
  },
  closeDelay: {
    control: { type: "number" },
  },
  closeOnClickOutside: {
    control: { type: "boolean" },
  },
  closeOnEscape: {
    control: { type: "boolean" },
  },
  closeOnItemClick: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = args => (
  <Flex justify="center">
    <Menu {...args}>
      <Menu.Target>
        <Button variant="filled">Toggle menu</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item>Question</Menu.Item>
        <Menu.Item>SQL query</Menu.Item>
        <Menu.Item>Dashboard</Menu.Item>
        <Menu.Item>Collection</Menu.Item>
        <Menu.Item>Model</Menu.Item>
        <Menu.Item>Action</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  </Flex>
);

const RightSectionTemplate = args => (
  <Flex justify="center">
    <Menu {...args}>
      <Menu.Target>
        <Button variant="filled">Toggle menu</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item rightSection={<Text color="inherit">⌘K</Text>}>
          Question
        </Menu.Item>
        <Menu.Item>SQL query</Menu.Item>
        <Menu.Item>Dashboard</Menu.Item>
        <Menu.Item>Collection</Menu.Item>
        <Menu.Item>Model</Menu.Item>
        <Menu.Item>Action</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  </Flex>
);

const IconsTemplate = args => (
  <Flex justify="center">
    <Menu {...args}>
      <Menu.Target>
        <Button variant="filled">Toggle menu</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item icon={<Icon name="insight" />}>Question</Menu.Item>
        <Menu.Item icon={<Icon name="sql" />}>SQL query</Menu.Item>
        <Menu.Item icon={<Icon name="dashboard" />}>Dashboard</Menu.Item>
        <Menu.Item icon={<Icon name="folder" />}>Collection</Menu.Item>
        <Menu.Item icon={<Icon name="model" />}>Model</Menu.Item>
        <Menu.Item icon={<Icon name="bolt" />}>Action</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  </Flex>
);

const LabelsAndDividersTemplate = args => (
  <Flex justify="center">
    <Menu {...args}>
      <Menu.Target>
        <Button variant="filled">Toggle menu</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Data</Menu.Label>
        <Menu.Item
          icon={<Icon name="insight" />}
          rightSection={<Text color="inherit">⌘K</Text>}
        >
          Question
        </Menu.Item>
        <Menu.Item icon={<Icon name="sql" />}>SQL query</Menu.Item>
        <Menu.Item icon={<Icon name="model" />}>Model</Menu.Item>
        <Menu.Item icon={<Icon name="bolt" />}>Action</Menu.Item>
        <Menu.Divider />
        <Menu.Label>Other</Menu.Label>
        <Menu.Item icon={<Icon name="dashboard" />}>Dashboard</Menu.Item>
        <Menu.Item icon={<Icon name="folder" />}>Collection</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  </Flex>
);

export default {
  title: "Overlays/Menu",
  component: Menu,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  name: "Default",
};

export const RightSection = {
  render: RightSectionTemplate,
  name: "Right section",
};

export const Icons = {
  render: IconsTemplate,
  name: "Icons",
};

export const LabelsAndDividers = {
  render: LabelsAndDividersTemplate,
  name: "Labels and dividers",
};
