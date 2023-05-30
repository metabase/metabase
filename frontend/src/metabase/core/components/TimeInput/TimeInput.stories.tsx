import React, { useState } from "react";
import moment from "moment-timezone";
import type { ComponentStory } from "@storybook/react";
import TimeInput from "./TimeInput";

export default {
  title: "Core/TimeInput",
  component: TimeInput,
};

const Template: ComponentStory<typeof TimeInput> = args => {
  const [value, setValue] = useState(moment("2020-01-01T10:20"));

  return (
    <TimeInput {...args} value={value} onChange={setValue} onClear={setValue} />
  );
};

export const Default = Template.bind({});
