import { Divider, type DividerProps, Group, Text } from "metabase/ui";

const args = {
  orientation: "horizontal",
};

const argTypes = {
  orientation: {
    options: ["horizontal", "vertical"],
    control: { type: "inline-radio" },
  },
};

const VerticalTemplate = (args: DividerProps) => (
  <Group>
    <Text>Overview</Text>
    <Divider {...args} />
    <Text>Metrics</Text>
    <Divider {...args} />
    <Text>Segments</Text>
  </Group>
);

export default {
  title: "Utils/Divider",
  component: Divider,
  args,
  argTypes,
};

export const Default = {};

export const VerticalOrientation = {
  render: VerticalTemplate,
  name: "Vertical orientation",
  args: {
    orientation: "vertical",
  },
};
