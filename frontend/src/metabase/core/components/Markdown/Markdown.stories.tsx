import React from "react";
import { ComponentStory } from "@storybook/react";
import Markdown from "./Markdown";

export default {
  title: "Core/Markdown",
  component: Markdown,
};

const Template: ComponentStory<typeof Markdown> = args => {
  return <Markdown {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  children: "Text",
};

export const Bold = Template.bind({});
Bold.args = {
  children: "**Bold**",
};

export const Link = Template.bind({});
Link.args = {
  children: "[Link](https://example.com)",
};
