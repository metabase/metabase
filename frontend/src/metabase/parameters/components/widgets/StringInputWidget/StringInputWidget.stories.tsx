import { useArgs } from "@storybook/addons";
import type { StoryFn } from "@storybook/react";

import { StringInputWidget } from "./StringInputWidget";

export default {
  title: "Parameters/StringInputWidget",
  component: StringInputWidget,
};

const Template: StoryFn<typeof StringInputWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: string[] | undefined) => {
    updateArgs({ value: v });
  };

  return (
    <StringInputWidget {...args} value={value} setValue={handleSetValue} />
  );
};

export const Default = {
  render: Template,

  args: {
    value: ["foo"],
  },
};

export const NArgs = {
  render: Template,

  args: {
    value: ["foo", "bar", "baz"],
    arity: "n",
    autoFocus: true,
  },
};
