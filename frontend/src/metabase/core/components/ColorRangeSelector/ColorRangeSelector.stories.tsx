import React from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import { color } from "metabase/lib/colors";
import ColorRangeSelector from "./ColorRangeSelector";

export default {
  title: "Core/ColorRangeSelector",
  component: ColorRangeSelector,
};

const Template: ComponentStory<typeof ColorRangeSelector> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (value: string[]) => {
    updateArgs({ value });
  };

  return <ColorRangeSelector {...args} value={value} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  value: [color("white"), color("brand")],
  colors: [color("brand"), color("summarize"), color("filter")],
};
