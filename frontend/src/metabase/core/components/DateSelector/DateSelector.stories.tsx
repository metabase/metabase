import type { StoryFn } from "@storybook/react";
import moment from "moment-timezone";
import { useState } from "react";

import DateSelector, { type DateSelectorProps } from "./DateSelector";

export default {
  title: "Core/DateSelector",
  component: DateSelector,
};

const Template: StoryFn<DateSelectorProps> = args => {
  const [value, setValue] = useState(args.value);
  return <DateSelector {...args} value={value} onChange={setValue} />;
};

export const Default = {
  render: Template,
};

export const WithTime = {
  render: Template,

  args: {
    value: moment("2015-01-01"),
    hasTime: true,
  },
};
