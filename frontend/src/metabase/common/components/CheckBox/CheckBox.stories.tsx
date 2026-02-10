import type { StoryFn } from "@storybook/react-webpack5";
import type { ChangeEvent } from "react";
import { useArgs } from "storybook/preview-api";

import { CheckBox } from "./CheckBox";

export default {
  title: "Deprecated/Components/CheckBox",
  component: CheckBox,
};

const Template: StoryFn<typeof CheckBox> = (args) => {
  const [{ checked }, updateArgs] = useArgs();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateArgs({ checked: event.currentTarget.checked });
  };

  return <CheckBox {...args} checked={checked} onChange={handleChange} />;
};

export const Default = {
  render: Template,

  args: {
    checked: false,
  },
};

export const WithLabel = {
  render: Template,

  args: {
    checked: false,
    label: "Label",
  },
};

export const WithCustomLabel = {
  render: Template,

  args: {
    checked: false,
    label: <strong style={{ marginLeft: "8px" }}>Label</strong>,
  },
};
