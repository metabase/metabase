import React from "react";
import { ComponentStory } from "@storybook/react";
import { color } from "metabase/lib/colors";
import BrandColorScheme from "./BrandColorScheme";

export default {
  title: "Whitelabel/BrandColorScheme",
  component: BrandColorScheme,
};

const Template: ComponentStory<typeof BrandColorScheme> = args => {
  return <BrandColorScheme {...args} />;
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
