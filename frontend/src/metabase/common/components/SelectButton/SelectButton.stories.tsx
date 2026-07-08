import type { StoryFn } from "@storybook/react";

import { SelectButton, type SelectButtonProps } from "./SelectButton";

export default {
  title: "Components/Ask Before Using/SelectButton",
  component: SelectButton,
};

const Template: StoryFn<SelectButtonProps> = (args) => {
  return <SelectButton {...args} />;
};

export const Default = {
  render: Template,

  args: {
    children: "Select an option",
    hasValue: false,
    fullWidth: false,
  },
};

export const Highlighted = {
  render: Template,

  args: {
    children: "Select an option",
    hasValue: true,
    fullWidth: false,
    highlighted: true,
  },
};

export const WithClearBehavior = {
  render: Template,

  args: {
    children: "Some value is selected",
    hasValue: true,
    fullWidth: false,
    onClear: () => null,
  },
};
