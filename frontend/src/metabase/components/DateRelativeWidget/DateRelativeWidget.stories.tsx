import { useArgs } from "@storybook/addons";
import type { StoryFn } from "@storybook/react";

import { DateRelativeWidget } from "./DateRelativeWidget";

export default {
  title: "Parameters/DateRelativeWidget",
  component: DateRelativeWidget,
};

const Template: StoryFn<typeof DateRelativeWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v?: string) => {
    updateArgs({ value: v });
  };

  const handleClose = () => {
    // do nothing
  };

  return (
    <DateRelativeWidget
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

export const Yesterday = {
  render: Template,

  args: {
    value: "yesterday",
  },
};

export const LastMonth = {
  render: Template,

  args: {
    value: "lastmonth",
  },
};

export const ThisWeek = {
  render: Template,

  args: {
    value: "thisweek",
  },
};
