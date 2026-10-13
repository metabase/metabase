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

export const WithValue = {
  render: Template,

  args: {
    children: "Some value is selected",
    hasValue: true,
    fullWidth: false,
  },
};

export const Disabled = {
  render: Template,

  args: {
    children: "Select an option",
    hasValue: false,
    fullWidth: false,
    disabled: true,
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
