import React, { useState } from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import ColorInput from "./ColorInput";

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
