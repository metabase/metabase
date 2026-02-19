import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";

import { ColorInput } from "./ColorInput";

export default {
  title: "Components/ColorInput",
  component: ColorInput,
};

const Template: StoryFn<typeof ColorInput> = (args) => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (value?: string) => {
    updateArgs({ value });
  };

  return <ColorInput {...args} value={value} onChange={handleChange} />;
};

export const Default = {
  render: Template,
};
