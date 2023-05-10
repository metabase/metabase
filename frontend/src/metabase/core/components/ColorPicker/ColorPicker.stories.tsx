import React from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import { color } from "metabase/lib/colors";
import ColorPicker from "./ColorPicker";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/ColorPicker",
  component: ColorPicker,
};

const Template: ComponentStory<typeof ColorPicker> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (value?: string) => {
    updateArgs({ value });
  };

  return <ColorPicker {...args} value={value} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  value: color("brand"),
  placeholder: color("brand"),
};
