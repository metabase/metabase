import React from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import StringInputWidget from "./StringInputWidget";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Parameters/StringInputWidget",
  component: StringInputWidget,
};

const Template: ComponentStory<typeof StringInputWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: string[] | undefined) => {
    updateArgs({ value: v });
  };

  return (
    <StringInputWidget {...args} value={value} setValue={handleSetValue} />
  );
};

export const Default = Template.bind({});
Default.args = {
  value: ["foo"],
};

export const NArgs = Template.bind({});
NArgs.args = {
  value: ["foo", "bar", "baz"],
  arity: "n",
  autoFocus: true,
};
