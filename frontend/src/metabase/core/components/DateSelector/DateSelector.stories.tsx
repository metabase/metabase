import React, { useState } from "react";
import { Moment } from "moment";
import { ComponentStory } from "@storybook/react";
import DateSelector from "./DateSelector";

export default {
  title: "Core/DateSelector",
  component: DateSelector,
};

const Template: ComponentStory<typeof DateSelector> = args => {
  const [date, setDate] = useState<Moment>();
  return <DateSelector {...args} date={date} onChangeDate={setDate} />;
};

export const Default = Template.bind({});

export const WithTime = Template.bind({});
WithTime.args = {
  hasTime: true,
};
