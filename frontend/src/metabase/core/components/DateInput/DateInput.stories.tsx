import type { StoryFn } from "@storybook/react";
import type { Moment } from "moment-timezone";
import { useState } from "react";

import DateInput from "./DateInput";

export default {
  title: "Core/DateInput",
  component: DateInput,
};

const Template: StoryFn<typeof DateInput> = args => {
  const [value, setValue] = useState<Moment>();
  return <DateInput {...args} value={value} onChange={setValue} />;
};

export const Default = {
  render: Template,
};

export const WithTime = {
  render: Template,

  args: {
    hasTime: true,
  },
};
