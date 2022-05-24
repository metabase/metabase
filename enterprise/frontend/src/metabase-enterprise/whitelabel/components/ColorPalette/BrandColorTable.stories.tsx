import React from "react";
import { ComponentStory } from "@storybook/react";
import BrandColorTable from "./BrandColorTable";

export default {
  title: "Whitelabel/BrandColorTable",
  component: BrandColorTable,
};

const Template: ComponentStory<typeof BrandColorTable> = args => {
  return <BrandColorTable {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  values: {},
};
