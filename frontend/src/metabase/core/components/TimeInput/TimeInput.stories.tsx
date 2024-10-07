import type { StoryFn } from "@storybook/react";
import moment from "moment-timezone";
import { useState } from "react";

import TimeInput from "./TimeInput";

export default {
  title: "Core/TimeInput",
  component: TimeInput,
};

const Template: StoryFn<typeof TimeInput> = args => {
  const [value, setValue] = useState(moment("2020-01-01T10:20"));

  return (
    <TimeInput {...args} value={value} onChange={setValue} onClear={setValue} />
  );
};

export const Default = {
  render: Template,
};
