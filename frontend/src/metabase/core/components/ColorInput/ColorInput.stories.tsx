import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

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
