import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";
import type { ChangeEvent } from "react";

import CheckBox from "./CheckBox";

export default {
  title: "Core/CheckBox",
  component: CheckBox,
};

const Template: ComponentStory<typeof CheckBox> = args => {
  const [{ checked }, updateArgs] = useArgs();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateArgs({ checked: event.currentTarget.checked });
  };

  return <CheckBox {...args} checked={checked} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  checked: false,
};

export const WithLabel = Template.bind({});
WithLabel.args = {
  checked: false,
  label: "Label",
};

export const WithCustomLabel = Template.bind({});
WithCustomLabel.args = {
  checked: false,
  label: <strong style={{ marginLeft: "8px" }}>Label</strong>,
};
