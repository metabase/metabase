import type { StoryFn } from "@storybook/react-webpack5";

import { Tooltip } from "./Tooltip";

export default {
  title: "Deprecated/Components/Tooltip",
  component: Tooltip,
};

const Template: StoryFn<typeof Tooltip> = (args) => {
  return <Tooltip {...args}>Hover me</Tooltip>;
};

export const Default = {
  render: Template,
  args: { tooltip: "Tooltip text" },
};

export const Controlled = {
  render: Template,
  args: { tooltip: "Controlled tooltip", isOpen: true },
};

export const CustomContent = {
  render: Template,

  args: {
    tooltip: (
      <div>
        <div style={{ background: "blue" }}>Blue</div>
        <div style={{ background: "red" }}>Red</div>
      </div>
    ),
  },
};

export const LongScalarString = {
  render: Template,

  args: {
    tooltip:
      "looooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooong string",
    isOpen: true,
  },
};
