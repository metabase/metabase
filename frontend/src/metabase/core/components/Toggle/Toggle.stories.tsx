import React from "react";
import { ComponentStory } from "@storybook/react";
import Toggle from "./Toggle";

export default {
  title: "Core/Toggle",
  component: Toggle,
  argTypes: { onChange: { action: "onChange" } },
};

const Template: ComponentStory<typeof Toggle> = args => {
  return <Toggle {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  value: false,
};
