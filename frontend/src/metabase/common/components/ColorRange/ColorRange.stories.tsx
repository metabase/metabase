import type { StoryFn } from "@storybook/react-webpack5";

import { color } from "metabase/lib/colors";

import { ColorRange, type ColorRangeProps } from "./ColorRange";

export default {
  title: "Components/Ask Before Using/ColorRange",
  component: ColorRange,
};

const Template: StoryFn<ColorRangeProps> = (args) => {
  return <ColorRange {...args} />;
};

export const Default = {
  render: Template,

  args: {
    colors: [color("white"), color("brand")],
  },
};

export const Inverted = {
  render: Template,

  args: {
    colors: [color("brand"), color("white")],
  },
};

export const ThreeColors = {
  render: Template,

  args: {
    colors: [color("error"), color("white"), color("success")],
  },
};
