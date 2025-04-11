import type { StoryFn } from "@storybook/react";
import dayjs from "dayjs";
import { useState } from "react";

import DateSelector, { type DateSelectorProps } from "./DateSelector";

export default {
  title: "Components/Ask Before Using/DateSelector",
  component: DateSelector,
};

const Template: StoryFn<DateSelectorProps> = (args) => {
  const [value, setValue] = useState(args.value);
  return <DateSelector {...args} value={value} onChange={setValue} />;
};

export const Default = {
  render: Template,
};

export const WithTime = {
  render: Template,

  args: {
    value: dayjs("2015-01-01"),
    hasTime: true,
  },
};
