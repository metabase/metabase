import { useArgs } from "@storybook/addons";
import type { StoryFn } from "@storybook/react";

import { TextWidget } from "./TextWidget";

export default {
  title: "Parameters/TextWidget",
  component: TextWidget,
};

const Template: StoryFn<typeof TextWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const setValue = (value: string | number | null) => {
    updateArgs({ value });
  };

  return <TextWidget {...args} value={value} setValue={setValue} />;
};

export const Default = {
  render: Template,

  args: {
    value: "",
  },
};

export const InitialValue = {
  render: Template,

  args: {
    value: "Toucan McBird",
  },
};

export const Placeholder = {
  render: Template,

  args: {
    value: "",
    placeholder: "What's your wish?",
  },
};
