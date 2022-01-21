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
  value: "W",
  options: [
    { name: "Gadget", value: "G" },
    { name: "Widget", value: "W" },
  ],
};
