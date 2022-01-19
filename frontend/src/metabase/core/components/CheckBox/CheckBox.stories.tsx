import React from "react";
import { ComponentStory } from "@storybook/react";
import CheckBox from "./CheckBox";

export default {
  title: "Core/CheckBox",
  component: CheckBox,
};

const Template: ComponentStory<typeof CheckBox> = args => {
  return <CheckBox {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  checked: false,
};
