import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";

import { color } from "metabase/lib/colors";

import { ColorPicker } from "./ColorPicker";

export default {
  title: "Components/ColorPicker",
  component: ColorPicker,
};

const Template: StoryFn<typeof ColorPicker> = (args) => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (value?: string) => {
    updateArgs({ value });
  };

  return <ColorPicker {...args} value={value} onChange={handleChange} />;
};

export const Default = {
  render: Template,

  args: {
    value: color("brand"),
    placeholder: color("brand"),
  },
};
