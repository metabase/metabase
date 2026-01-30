import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";

import { Toggle } from "./Toggle";

export default {
  title: "Deprecated/Components/Toggle",
  component: Toggle,
};

const Template: StoryFn<typeof Toggle> = (args) => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: boolean) => updateArgs({ value });

  return <Toggle {...args} value={value} onChange={handleChange} />;
};

export const Default = {
  render: Template,

  args: {
    value: false,
  },
};
