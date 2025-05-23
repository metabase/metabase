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
  color: {
    control: { type: "text" },
  },
};

const DefaultTemplate = (args: TooltipProps) => (
  <Flex justify="center" mih="200px">
    <Tooltip {...args}>
      <Button variant="filled">Toggle tooltip</Button>
    </Tooltip>
  </Flex>
);

export default {
  title: "Components/Overlays/Tooltip",
  component: Tooltip,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  parameters: { loki: { skip: true } },
};

export const LongContentWithFixedWidth = {
  render: DefaultTemplate,
  args: {
    opened: true,
    label: (
      <div style={{ maxWidth: 350 }}>
        The query for this chart was run in America/Toronto rather than UTC due
        to database or driver constraints.
      </div>
    ),
  },
};
