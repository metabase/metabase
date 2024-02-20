import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import YearPicker from "./YearPicker";

export default {
  title: "Parameters/YearPicker",
  component: YearPicker,
};

const Template: ComponentStory<typeof YearPicker> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (year: number) => {
    updateArgs({ value: year });
  };

  return <YearPicker {...args} value={value} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  value: 2022,
};
