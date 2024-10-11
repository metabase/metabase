import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";

import YearPicker from "./YearPicker";

export default {
  title: "Parameters/YearPicker",
  component: YearPicker,
};

const Template: StoryFn<typeof YearPicker> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (year: number) => {
    updateArgs({ value: year });
  };

  return <YearPicker {...args} value={value} onChange={handleChange} />;
};

export const Default = {
  render: Template,

  args: {
    value: 2022,
  },
};
