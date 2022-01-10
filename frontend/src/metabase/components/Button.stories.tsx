import React from "react";
import { ComponentStory } from "@storybook/react";

import Button from "./Button";

export default {
  title: "UI/Button",
  component: Button,
};

const Template: ComponentStory<typeof Button> = args => {
  return <Button {...args} />;
};

export const Example = Template.bind({});
Example.args = {
  children: "Icon should be to my left, not above me",
  icon: "chevronleft",
};
