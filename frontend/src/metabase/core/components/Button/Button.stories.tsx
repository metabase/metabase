import React from "react";
import { ComponentStory } from "@storybook/react";
import Button from "./Button";

export default {
  title: "Core/Button",
  component: Button,
};

const Template: ComponentStory<typeof Button> = args => {
  return <Button {...args} />;
};

export const Primary = Template.bind({});
Primary.args = {
  variant: "primary",
  children: "Do something",
};
