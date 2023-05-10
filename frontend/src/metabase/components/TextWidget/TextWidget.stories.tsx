import React from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import TextWidget from "./TextWidget";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Parameters/TextWidget",
  component: TextWidget,
};

const Template: ComponentStory<typeof TextWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const setValue = (value: string | number | null) => {
    updateArgs({ value });
  };

  return <TextWidget {...args} value={value} setValue={setValue} />;
};

export const Default = Template.bind({});
Default.args = {
  value: "",
};

export const InitialValue = Template.bind({});
InitialValue.args = {
  value: "Toucan McBird",
};

export const Placeholder = Template.bind({});
Placeholder.args = {
  value: "",
  placeholder: "What's your wish?",
};
