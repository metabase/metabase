import type { StoryFn } from "@storybook/react-webpack5";

import { color } from "metabase/lib/colors";

import { ColorPill, type ColorPillProps } from "./ColorPill";

export default {
  title: "Components/ColorPill",
  component: ColorPill,
};

const Template: StoryFn<ColorPillProps> = (args) => {
  return <ColorPill {...args} />;
};

export const Default = {
  render: Template,

  args: {
    color: color("brand"),
  },
};

export const Auto = {
  render: Template,

  args: {
    color: color("brand"),
    isAuto: true,
  },
};
