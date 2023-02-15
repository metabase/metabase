import React from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import ColorInput from "./ColorInput";

export default {
  title: "Core/ColorInput",
  component: ColorInput,
};

const Template: ComponentStory<typeof ColorInput> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (value?: string) => {
    updateArgs({ value });
  };

  return <ColorInput {...args} value={value} onChange={handleChange} />;
};

export const Default = Template.bind({});
