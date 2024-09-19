import type { StoryFn } from "@storybook/react";

import { color } from "metabase/lib/colors";

import ColorRange from "./ColorRange";

export default {
  title: "Core/ColorRange",
  component: ColorRange,
};

const Template: StoryFn<typeof ColorRange> = args => {
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
