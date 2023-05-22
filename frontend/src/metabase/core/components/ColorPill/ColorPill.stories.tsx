import React from "react";
import type { ComponentStory } from "@storybook/react";
import { color } from "metabase/lib/colors";
import ColorPill from "./ColorPill";

// eslint-disable-next-line import/no-default-export -- deprecated usage
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
