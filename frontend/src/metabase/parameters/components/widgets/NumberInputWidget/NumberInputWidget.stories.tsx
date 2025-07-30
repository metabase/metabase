import type { StoryFn } from "@storybook/react-webpack5";
import { useArgs } from "storybook/preview-api";

import type { ParameterValueOrArray } from "metabase-types/api";

import { NumberInputWidget } from "./NumberInputWidget";

export default {
  title: "Components/Parameters/NumberInputWidget",
  component: NumberInputWidget,
};

const Template: StoryFn<typeof NumberInputWidget> = (args) => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: ParameterValueOrArray | null | undefined) => {
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
