import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";

import { DateMonthYearWidget } from "./DateMonthYearWidget";

export default {
  title: "Parameters/DateMonthYearWidget",
  component: DateMonthYearWidget,
};

const Template: StoryFn<typeof DateMonthYearWidget> = args => {
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

export const Default = {
  render: Template,

  args: {
    value: "",
  },
};

export const ThisYear = {
  render: Template,

  args: {
    value: "2022",
  },
};

export const LastYear = {
  render: Template,

  args: {
    value: "2021-07",
  },
};
