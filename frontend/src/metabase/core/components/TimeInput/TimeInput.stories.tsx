import React, { useState } from "react";
import { Duration } from "moment-timezone";
import { ComponentStory } from "@storybook/react";
import TimeInput from "./TimeInput";

export default {
  title: "Core/TimeInput",
  component: TimeInput,
};

const Template: ComponentStory<typeof TimeInput> = args => {
  const [value, setValue] = useState<Duration>();
  return <TimeInput {...args} value={value} onChange={setValue} />;
};

export const Default = Template.bind({});
