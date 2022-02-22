import React, { useState } from "react";
import { Moment } from "moment-timezone";
import { ComponentStory } from "@storybook/react";
import DateSelector from "./DateSelector";

export default {
  title: "Core/DateSelector",
  component: DateSelector,
};

const Template: ComponentStory<typeof DateSelector> = args => {
  const [date, setDate] = useState<Moment>();
  const [timezone, setTimezone] = useState("US/Central");

  return (
    <DateSelector
      {...args}
      date={date}
      timezone={timezone}
      onChangeDate={setDate}
      onChangeTimezone={setTimezone}
    />
  );
};

export const Default = Template.bind({});

export const WithTime = Template.bind({});
WithTime.args = {
  hasTime: true,
};

export const WithTimezone = Template.bind({});
WithTimezone.args = {
  hasTime: true,
  timezone: "US/Central",
  timezones: ["Canada/Central", "US/Central"],
};
