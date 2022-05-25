import React from "react";
import { ComponentStory } from "@storybook/react";
import { color } from "metabase/lib/colors";
import ColorSettings from "./ColorSettings";

export default {
  title: "Whitelabel/ColorSettings",
  component: ColorSettings,
};

const Template: ComponentStory<typeof ColorSettings> = args => {
  return <ColorSettings {...args} />;
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
