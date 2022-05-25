import React from "react";
import { ComponentStory } from "@storybook/react";
import { color } from "metabase/lib/colors";
import ColorSchemeWidget from "./ColorSchemeWidget";

export default {
  title: "Whitelabel/ColorSchemeWidget",
  component: ColorSchemeWidget,
};

const Template: ComponentStory<typeof ColorSchemeWidget> = args => {
  return <ColorSchemeWidget {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  initialColors: {
    brand: color("brand"),
  },
  originalColors: {
    brand: color("brand"),
    accent1: color("accent1"),
    accent7: color("accent7"),
  },
};
