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
Template.args = {
  value: "L",
  options: [
    { name: "Line", value: "L" },
    { name: "Area", value: "A" },
    { name: "Bar", value: "B" },
  ],
};

// Provides a smaller container for testing wrapping
const WrappedTemplate: ComponentStory<typeof Radio> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return (
    <div style={{ width: 250, overflow: "auto" }}>
      <Radio {...args} value={value} onChange={handleChange} />
    </div>
  );
};
WrappedTemplate.args = {
  value: "L",
  options: [
    { name: "Something", value: "L" },
    { name: "Fairly", value: "A" },
    { name: "Looooong", value: "B" },
  ],
  wrap: true,
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

export const Wrapped = WrappedTemplate.bind({});
Wrapped.args = {
  ...WrappedTemplate.args,
  variant: "bubble",
};
