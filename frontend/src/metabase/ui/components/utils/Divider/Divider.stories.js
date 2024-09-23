import { Divider, Group, Text } from "metabase/ui";

const args = {
  orientation: "horizontal",
};

const argTypes = {
  orientation: {
    options: ["horizontal", "vertical"],
    control: { type: "inline-radio" },
  },
};

const DefaultTemplate = args => <Divider {...args} />;

const VerticalTemplate = args => (
  <Group>
    <Text>Overview</Text>
    <Divider {...args} />
    <Text>Metrics</Text>
    <Divider {...args} />
    <Text>Segments</Text>
  </Group>
);

const Default = DefaultTemplate.bind({});
const Vertical = VerticalTemplate.bind({});

export default {
  title: "Utils/Divider",
  component: Divider,
  args: args,
  argTypes: argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const VerticalOrientation = {
  render: Vertical,
  name: "Vertical orientation",
  args: {
    orientation: "vertical",
  },
};
