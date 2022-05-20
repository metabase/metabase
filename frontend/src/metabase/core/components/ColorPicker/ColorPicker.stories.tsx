import React from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import ColorPicker from "./ColorPicker";

export default {
  title: "Core/ColorPicker",
  component: ColorPicker,
};

const Template: ComponentStory<typeof ColorPicker> = args => {
  const [{ color }, updateArgs] = useArgs();

  const handleChange = (color: string) => {
    updateArgs({ color });
  };

  return <ColorPicker {...args} color={color} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  color: "white",
};
