import React from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import { color } from "metabase/lib/colors";
import ColorSelector from "./ColorSelector";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/ColorSelector",
  component: ColorSelector,
};

const Template: ComponentStory<typeof ColorSelector> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (value: string) => {
    updateArgs({ value });
  };

  return <ColorSelector {...args} value={value} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  value: color("brand"),
  colors: [color("brand"), color("summarize"), color("filter")],
};
