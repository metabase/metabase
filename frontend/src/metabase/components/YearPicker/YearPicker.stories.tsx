import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
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
