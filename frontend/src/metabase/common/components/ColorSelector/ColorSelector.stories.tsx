import type { StoryFn } from "@storybook/react-webpack5";
import { useArgs } from "storybook/preview-api";

import { color } from "metabase/lib/colors";

import { ColorSelector, type ColorSelectorProps } from "./ColorSelector";

export default {
  title: "Components/Ask Before Using/ColorSelector",
  component: ColorSelector,
};

const Template: StoryFn<ColorSelectorProps> = (args) => {
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
