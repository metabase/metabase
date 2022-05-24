import React from "react";
import { ComponentStory } from "@storybook/react";
import { color } from "metabase/lib/colors";
import BrandColors from "./BrandColors";

export default {
  title: "Whitelabel/BrandColors",
  component: BrandColors,
};

const Template: ComponentStory<typeof BrandColors> = args => {
  return <BrandColors {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  colors: {
    brand: color("brand"),
    accent1: color("accent1"),
  },
  originalColors: {
    accent7: color("accent7"),
  },
};
