import React from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import DateRelativeWidget from "./DateRelativeWidget";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Parameters/DateRelativeWidget",
  component: DateRelativeWidget,
};

const Template: ComponentStory<typeof DateRelativeWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v?: string) => {
    updateArgs({ value: v });
  };

  const handleClose = () => {
    // do nothing
  };

  return (
    <DateRelativeWidget
      {...args}
      value={value}
      setValue={handleSetValue}
      onClose={handleClose}
    />
  );
};

export const Default = Template.bind({});
Default.args = {
  value: "",
};

export const Yesterday = Template.bind({});
Yesterday.args = {
  value: "yesterday",
};

export const LastMonth = Template.bind({});
LastMonth.args = {
  value: "lastmonth",
};

export const ThisWeek = Template.bind({});
ThisWeek.args = {
  value: "thisweek",
};
