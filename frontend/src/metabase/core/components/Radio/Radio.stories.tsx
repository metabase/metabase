import React from "react";
import { ComponentStory } from "@storybook/react";
import Radio from "./Radio";

export default {
  title: "Core/Radio",
  component: Radio,
};

const Template: ComponentStory<typeof Radio> = args => {
  return <Radio {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  options: [
    { name: "Gadget", value: 0 },
    { name: "Gizmo", value: 1 },
  ],
};
