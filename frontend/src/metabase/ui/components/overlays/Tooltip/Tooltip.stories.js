import { Button, Flex, Tooltip } from "metabase/ui";

const args = {
  label: "Tooltip",
  position: "bottom",
};

const argTypes = {
  label: {
    control: { type: "text" },
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
};

const DefaultTemplate = args => (
  <Flex justify="center">
    <Tooltip {...args}>
      <Button variant="filled">Toggle tooltip</Button>
    </Tooltip>
  </Flex>
);

const Default = DefaultTemplate.bind({});

export default {
  title: "Overlays/Tooltip",
  component: Tooltip,
  args,
  argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};
