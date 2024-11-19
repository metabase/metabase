import { Button, Flex, Tooltip, type TooltipProps } from "metabase/ui";

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

const DefaultTemplate = (args: TooltipProps) => (
  <Flex justify="center">
    <Tooltip {...args}>
      <Button variant="filled">Toggle tooltip</Button>
    </Tooltip>
  </Flex>
);

export default {
  title: "Overlays/Tooltip",
  component: Tooltip,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};
