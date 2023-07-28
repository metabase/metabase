import { useState } from "react";
import { Moment } from "moment-timezone";
import type { ComponentStory } from "@storybook/react";
import DateInput from "./DateInput";

export default {
  title: "Core/DateInput",
  component: DateInput,
};

const Template: ComponentStory<typeof DateInput> = args => {
  const [value, setValue] = useState<Moment>();
  return <DateInput {...args} value={value} onChange={setValue} />;
};

export const Default = Template.bind({});

export const WithTime = Template.bind({});
WithTime.args = {
  hasTime: true,
};
