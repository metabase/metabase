import React from "react";
import { ComponentStory } from "@storybook/react";
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
  values: {},
};
