import React, { useState } from "react";
import { ComponentStory } from "@storybook/react";
import Slider from "./Slider";

export default {
  title: "Core/Slider",
  component: Slider,
};

const Template: ComponentStory<typeof Slider> = args => {
  const [value, setValue] = useState<(number | undefined)[]>([10, 40]);
  return (
    <div className="pt4">
      <Slider {...args} value={value} onChange={setValue} />
    </div>
  );
};

export const Default = Template.bind({});
