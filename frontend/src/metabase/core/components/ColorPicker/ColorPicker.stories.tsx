import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";

import ColorPicker from "./ColorPicker";

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
