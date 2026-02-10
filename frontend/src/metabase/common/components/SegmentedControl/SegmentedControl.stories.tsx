import type { StoryFn } from "@storybook/react-webpack5";
import { useArgs } from "storybook/preview-api";

import {
  SegmentedControl,
  type SegmentedControlProps,
} from "./SegmentedControl";

export default {
  title: "Deprecated/Components/SegmentedControl",
  component: SegmentedControl,
};

const Template: StoryFn<SegmentedControlProps<number>> = (args) => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return <SegmentedControl {...args} value={value} onChange={handleChange} />;
};

Template.args = {
  value: 0,
};

export const Default = {
  render: Template,

  args: {
    options: [
      { name: "Gadget", value: 0 },
      { name: "Gizmo", value: 1 },
    ],
  },
};

export const WithIcons = {
  render: Template,

  args: {
    options: [
      { name: "Gadget", value: 0, icon: "lightbulb" },
      { name: "Gizmo", value: 1, icon: "folder" },
      { name: "Doohickey", value: 2, icon: "insight" },
    ],
  },
};

export const OnlyIcons = {
  render: Template,

  args: {
    options: [
      { value: 0, icon: "lightbulb" },
      { value: 1, icon: "folder" },
      { value: 2, icon: "insight" },
    ],
  },
};

export const WithColors = {
  render: Template,

  args: {
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
  },
};
