import React from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import DateSingleWidget from "./DateSingleWidget";

export default {
  title: "Parameters/DateSingleWidget",
  component: DateSingleWidget,
};

const Template: ComponentStory<typeof DateSingleWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: string | null) => {
    // do nothing
  };

  const handleClose = () => {
    // do nothing
  };

  return (
    <DateSingleWidget
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
