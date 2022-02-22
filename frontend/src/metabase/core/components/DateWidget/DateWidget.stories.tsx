import React, { useState } from "react";
import { Moment } from "moment-timezone";
import { ComponentStory } from "@storybook/react";
import DateWidget from "./DateWidget";

export default {
  title: "Core/DateWidget",
  component: DateWidget,
};

const Template: ComponentStory<typeof DateWidget> = args => {
  const [value, setValue] = useState<Moment>();
  const [timezone, setTimezone] = useState<string>();

  return (
    <DateWidget
      {...args}
      date={value}
      timezone={timezone}
      onChangeDate={setValue}
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
  hasTimezone: true,
  timezone: "US/Central",
  timezones: ["Canada/Central", "US/Central"],
};
