import React, { useState } from "react";
import { ComponentStory } from "@storybook/react";
import ColorInput from "./ColorInput";
import { useArgs } from "@storybook/client-api";

export default {
  title: "Core/ColorInput",
  component: ColorInput,
};

const Template: ComponentStory<typeof ColorInput> = args => {
  const [{ color }, updateArgs] = useArgs();

  const handleChange = (color?: string) => {
    updateArgs({ color });
  };

  return <ColorInput {...args} color={color} onChange={handleChange} />;
};

export const Default = Template.bind({});
