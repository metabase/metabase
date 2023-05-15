import React, { useState } from "react";
import type { ComponentStory } from "@storybook/react";
import NumericInput from "./NumericInput";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/NumericInput",
  component: NumericInput,
};

const Template: ComponentStory<typeof NumericInput> = args => {
  const [value, setValue] = useState<number>();
  return <NumericInput {...args} value={value} onChange={setValue} />;
};

export const Default = Template.bind({});
