import React from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import { color } from "metabase/lib/colors";
import ColorSelector from "./ColorSelector";

export default {
  title: "Core/ColorSelector",
  component: ColorSelector,
};

const Template: ComponentStory<typeof ColorSelector> = args => {
  const [{ color }, updateArgs] = useArgs();

  const handleChange = (color: string) => {
    updateArgs({ color });
  };

  return <ColorSelector {...args} color={color} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  color: color("brand"),
  colors: [color("brand"), color("summarize"), color("filter")],
};
