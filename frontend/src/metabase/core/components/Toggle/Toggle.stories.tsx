import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import Toggle from "./Toggle";

export default {
  title: "Core/Toggle",
  component: Toggle,
};

const Template: ComponentStory<typeof Toggle> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: boolean) => updateArgs({ value });

  return <Toggle {...args} value={value} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  value: false,
};
