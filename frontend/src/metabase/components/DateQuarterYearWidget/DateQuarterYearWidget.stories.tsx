import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";

import { DateQuarterYearWidget } from "./DateQuarterYearWidget";

export default {
  title: "Parameters/DateQuarterYearWidget",
  component: DateQuarterYearWidget,
};

const Template: StoryFn<typeof DateQuarterYearWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: string) => {
    updateArgs({ value: v });
  };

  const handleClose = () => {
    // do nothing
  };

  return (
    <DateQuarterYearWidget
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

export const SomeTimeLastYear = {
  render: Template,

  args: {
    value: "4-2021",
  },
};

export const SomeTimeAgo = {
  render: Template,

  args: {
    value: "2-1981",
  },
};
