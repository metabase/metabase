import React, { useState } from "react";
import { Moment } from "moment";
import { ComponentStory } from "@storybook/react";
import DateInput from "./DateInput";

export default {
  title: "Core/DateInput",
  component: DateInput,
};

const Template: ComponentStory<typeof DateInput> = args => {
  const [value, setValue] = useState<Moment>();
  return <DateInput value={value} onChange={setValue} {...args} />;
};

export const Default = Template.bind({});

export const WithError = Template.bind({});
WithError.args = {
  error: true,
};
