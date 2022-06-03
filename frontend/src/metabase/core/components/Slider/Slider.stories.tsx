import React, { useState } from "react";
import { ComponentStory } from "@storybook/react";
import Slider from "./Slider";

export default {
  title: "Core/Slider",
  component: Slider,
};

const Template: ComponentStory<typeof Slider> = args => {
  const [value, setValue] = useState([10, 40]);
  return <Slider {...args} value={value} onChange={setValue} />;
};

export const Default = Template.bind({});
