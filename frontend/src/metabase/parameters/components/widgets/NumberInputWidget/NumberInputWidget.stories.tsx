import { useArgs } from "@storybook/addons";
import type { StoryFn } from "@storybook/react";

import { NumberInputWidget } from "./NumberInputWidget";

export default {
  title: "Parameters/NumberInputWidget",
  component: NumberInputWidget,
};

const Template: StoryFn<typeof NumberInputWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: number[] | undefined) => {
    updateArgs({ value: v });
  };

  return (
    <NumberInputWidget {...args} value={value} setValue={handleSetValue} />
  );
};

export const Default = {
  render: Template,

  args: {
    value: [1],
  },
};

export const TwoArgs = {
  render: Template,

  args: {
    value: [1, 2],
    arity: 2,
    infixText: "and",
  },
};

export const ThreeArgs = {
  render: Template,

  args: {
    value: [1, 2],
    arity: 3,
    infixText: "foo",
    autoFocus: true,
  },
};

export const NArgs = {
  render: Template,

  args: {
    value: [1, 2, 3, 4, 5, 6],
    arity: "n",
    autoFocus: true,
  },
};
