import React from "react";
import { ComponentStory } from "@storybook/react";
import Tab from "./Tab";

export default {
  title: "Core/Tab",
  component: Tab,
};

const Template: ComponentStory<typeof Tab> = args => {
  return <Tab {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  children: "Tab",
};

export const WithIcon = Template.bind({});
WithIcon.args = {
  icon: "link",
  children: "Tab",
};
