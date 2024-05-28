import type { ComponentStory } from "@storybook/react";

import Tooltip from "./Tooltip";

export default {
  title: "Core/Tooltip",
  component: Tooltip,
};

const Template: ComponentStory<typeof Tooltip> = args => {
  return <Tooltip {...args}>Hover me</Tooltip>;
};

export const Default = Template.bind({});
Default.args = { tooltip: "Tooltip text" };

export const Controlled = Template.bind({});
Controlled.args = { tooltip: "Controlled tooltip", isOpen: true };

export const CustomContent = Template.bind({});
CustomContent.args = {
  tooltip: (
    <div>
      <div style={{ background: "blue" }}>Blue</div>
      <div style={{ background: "red" }}>Red</div>
    </div>
  ),
};

export const LongScalarString = Template.bind({});
LongScalarString.args = {
  tooltip:
    "looooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooong string",
  isOpen: true,
};
