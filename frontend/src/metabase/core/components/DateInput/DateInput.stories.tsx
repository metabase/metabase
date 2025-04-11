import type { StoryFn } from "@storybook/react";
import type { Dayjs } from "dayjs";
import { useState } from "react";

import DateInput from "./DateInput";

export default {
  title: "Components/Ask Before Using/DateInput",
  component: DateInput,
};

const Template: StoryFn<typeof DateInput> = (args) => {
  const [value, setValue] = useState<Dayjs>();
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
