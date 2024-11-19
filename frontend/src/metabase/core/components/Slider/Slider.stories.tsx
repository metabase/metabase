import type { SliderProps } from "@mantine/core";
import type { StoryFn } from "@storybook/react";

import CS from "metabase/css/core/index.css";

import Slider from "./Slider";

export default {
  title: "Core/Slider",
  component: Slider,
  argTypes: { onChange: { action: "onChange" } },
};

const Template: StoryFn<SliderProps> = args => {
  const value = [10, 40];

  return (
    <div className={CS.pt4}>
      {/* @ts-expect-error - fix onChange type */}
      <Slider {...args} value={value} onChange={args.onChange} />
    </div>
  );
};

export const Default = {
  render: Template,
};
