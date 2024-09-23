import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";

import Radio from "./Radio";

export default {
  title: "Deprecated/Radio",
  component: Radio,
};

const Template: StoryFn<typeof Radio> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return <Radio {...args} value={value} onChange={handleChange} />;
};
Template.args = {
  value: "L",
  options: [
    { name: "Line", value: "L" },
    { name: "Area", value: "A" },
    { name: "Bar", value: "B" },
  ],
};

export const Default = {
  render: Template,

  args: {
    ...Template.args,
    variant: "normal",
  },
};

export const Underlined = {
  render: Template,

  args: {
    ...Template.args,
    variant: "underlined",
  },
};

export const Bubble = {
  render: Template,

  args: {
    ...Template.args,
    variant: "bubble",
  },
};
