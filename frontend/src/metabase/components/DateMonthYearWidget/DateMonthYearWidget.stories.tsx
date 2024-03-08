import { useArgs } from "@storybook/client-api";
import type { ComponentStory } from "@storybook/react";

import { DateMonthYearWidget } from "./DateMonthYearWidget";

export default {
  title: "Parameters/DateMonthYearWidget",
  component: DateMonthYearWidget,
};

const Template: ComponentStory<typeof DateMonthYearWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: string) => {
    updateArgs({ value: v });
  };

  const handleClose = () => {
    // do nothing
  };

  return (
    <DateMonthYearWidget
      {...args}
      value={value}
      setValue={handleSetValue}
      onClose={handleClose}
    />
  );
};

export const Default = Template.bind({});
Default.args = {
  value: "",
};

export const ThisYear = Template.bind({});
ThisYear.args = {
  value: "2022",
};

export const LastYear = Template.bind({});
LastYear.args = {
  value: "2021-07",
};
