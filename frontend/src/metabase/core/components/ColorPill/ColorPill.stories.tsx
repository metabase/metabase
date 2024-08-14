import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";

import ColorPill from "./ColorPill";

export default {
  title: "Core/ColorPill",
  component: ColorPill,
};

const Template: ComponentStory<typeof ColorPill> = args => {
  return <ColorPill {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  color: color("brand"),
};

export const Auto = Template.bind({});
Auto.args = {
  color: color("brand"),
  isAuto: true,
};
