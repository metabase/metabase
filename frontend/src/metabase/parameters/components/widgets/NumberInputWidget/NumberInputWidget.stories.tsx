import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import { NumberInputWidget } from "./NumberInputWidget";

export default {
  title: "Parameters/NumberInputWidget",
  component: NumberInputWidget,
};

const Template: ComponentStory<typeof NumberInputWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: number[] | undefined) => {
    updateArgs({ value: v });
  };

  return (
    <NumberInputWidget {...args} value={value} setValue={handleSetValue} />
  );
};

export const Default = Template.bind({});
Default.args = {
  value: [1],
};

export const TwoArgs = Template.bind({});
TwoArgs.args = {
  value: [1, 2],
  arity: 2,
  infixText: "and",
};

export const ThreeArgs = Template.bind({});
ThreeArgs.args = {
  value: [1, 2],
  arity: 3,
  infixText: "foo",
  autoFocus: true,
};

export const NArgs = Template.bind({});
NArgs.args = {
  value: [1, 2, 3, 4, 5, 6],
  arity: "n",
  autoFocus: true,
};
