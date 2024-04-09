import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import Radio from "./Radio";

export default {
  title: "Deprecated/Radio",
  component: Radio,
};

const Template: ComponentStory<typeof Radio> = args => {
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

export const Default = Template.bind({});
Default.args = {
  ...Template.args,
  variant: "normal",
};

export const Underlined = Template.bind({});
Underlined.args = {
  ...Template.args,
  variant: "underlined",
};

export const Bubble = Template.bind({});
Bubble.args = {
  ...Template.args,
  variant: "bubble",
};
