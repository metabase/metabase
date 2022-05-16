import React from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import DateAllOptionsWidget from "./DateAllOptionsWidget";

export default {
  title: "Parameters/DateAllOptionsWidget",
  component: DateAllOptionsWidget,
};

const Template: ComponentStory<typeof DateAllOptionsWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: string | null) => {
    updateArgs({ value: v });
  };
  const handleClose = () => {
    // do nothing
  };

  return (
    <DateAllOptionsWidget
      {...args}
      value={value}
      setValue={handleSetValue}
      onClose={handleClose}
    />
  );
};

export const Default = Template.bind({});
Default.args = {
  value: "2022-05-17",
};
