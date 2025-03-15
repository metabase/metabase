import type { StoryFn } from "@storybook/react";

import { Combobox, type ComboboxProps } from "metabase/ui";

const argTypes = {
  size: {
    options: ["xs", "sm", "md", "lg", "xl"],
    control: { type: "inline-radio" },
  },
};

export default {
  title: "Components/Ask Before Using/Combobox",
  component: Combobox,
  args: {
    size: "md",
    children: "Text",
  },
  argTypes,
};

const Template: StoryFn<ComboboxProps> = args => {
  return <Combobox {...args} />;
};

export const Default = {
  render: Template,
};
