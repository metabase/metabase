import React from "react";
import { ComponentStory } from "@storybook/react";
import HelloWorld from "./HelloWorld";

export default {
  title: "HelloWorld",
  component: HelloWorld,
};

const Template: ComponentStory<typeof HelloWorld> = args => {
  return <HelloWorld />;
};

export const Default = Template.bind({});
Default.args = {};
