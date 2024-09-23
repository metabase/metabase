import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";

import { color } from "metabase/lib/colors";

import ColorSelector from "./ColorSelector";

export default {
  title: "Core/ColorSelector",
  component: ColorSelector,
};

const Template: StoryFn<typeof ColorSelector> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (value: string) => {
    updateArgs({ value });
  };

  return <ColorSelector {...args} value={value} onChange={handleChange} />;
};

export const Default = {
  render: Template,

  args: {
    value: color("brand"),
    colors: [color("brand"), color("summarize"), color("filter")],
  },
};
