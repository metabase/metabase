import React from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import Radio from "./Radio";

export default {
  title: "Core/Radio",
  component: Radio,
};

const Template: ComponentStory<typeof Radio> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return <Radio {...args} value={value} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  value: "G",
  options: [
    { name: "Gadget", value: "G" },
    { name: "Widget", value: "W" },
  ],
};
