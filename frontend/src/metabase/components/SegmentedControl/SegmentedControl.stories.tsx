import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import { SegmentedControl } from "./SegmentedControl";

export default {
  title: "Components/SegmentedControl",
  component: SegmentedControl,
};

const Template: ComponentStory<typeof SegmentedControl> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return <SegmentedControl {...args} value={value} onChange={handleChange} />;
};

Template.args = {
  value: 0,
};

export const Default = Template.bind({});
Default.args = {
  options: [
    { name: "Gadget", value: 0 },
    { name: "Gizmo", value: 1 },
  ],
};

export const WithIcons = Template.bind({});
WithIcons.args = {
  options: [
    { name: "Gadget", value: 0, icon: "lightbulb" },
    { name: "Gizmo", value: 1, icon: "folder" },
    { name: "Doohickey", value: 2, icon: "insight" },
  ],
};

export const OnlyIcons = Template.bind({});
OnlyIcons.args = {
  options: [
    { value: 0, icon: "lightbulb" },
    { value: 1, icon: "folder" },
    { value: 2, icon: "insight" },
  ],
};

export const WithColors = Template.bind({});
WithColors.args = {
  options: [
    {
      name: "Gadget",
      value: 0,
      icon: "lightbulb",
      selectedColor: "accent1",
    },
    { name: "Gizmo", value: 1, icon: "folder", selectedColor: "accent2" },
    { name: "Doohickey", value: 2, icon: "insight" },
  ],
};
