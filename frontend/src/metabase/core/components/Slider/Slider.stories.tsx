import type { ComponentStory } from "@storybook/react";

import CS from "metabase/css/core/index.css";

import Slider from "./Slider";

export default {
  title: "Core/Slider",
  component: Slider,
  argTypes: { onChange: { action: "onChange" } },
};

const Template: ComponentStory<typeof Slider> = args => {
  const value = [10, 40];
  return (
    <div className={CS.pt4}>
      <Slider {...args} value={value} onChange={args.onChange} />
    </div>
  );
};

export const Default = Template.bind({});
