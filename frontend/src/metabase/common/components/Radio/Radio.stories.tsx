import type { StoryFn } from "@storybook/react-webpack5";
import { useArgs } from "storybook/preview-api";

import { Radio, type RadioProps } from "./Radio";

export default {
  title: "Deprecated/Components/Radio",
  component: Radio,
};

const Template: StoryFn<RadioProps<any>> = (args) => {
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
