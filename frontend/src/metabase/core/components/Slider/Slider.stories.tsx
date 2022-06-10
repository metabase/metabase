import React, { useState } from "react";
import { ComponentStory } from "@storybook/react";
import Slider from "./Slider";

export default {
  title: "Core/Slider",
  component: Slider,
  argTypes: { onChange: { action: "onChange" } },
};

const Template: ComponentStory<typeof Slider> = args => {
  const [value] = useState<(number | undefined)[]>([0, 100]);
  return (
    <div className="pt4">
      <Slider {...args} value={value} onChange={args.onChange} />
    </div>
  );
};

export const Default = Template.bind({});
