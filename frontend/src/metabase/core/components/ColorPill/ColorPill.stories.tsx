import type { StoryFn } from "@storybook/react";

import { color } from "metabase/lib/colors";

import ColorPill from "./ColorPill";

export default {
  title: "Core/ColorPill",
  component: ColorPill,
};

const Template: StoryFn<typeof ColorPill> = args => {
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
