import React from "react";
import { ComponentStory } from "@storybook/react";

import { DatePicker } from "./DatePicker";

export default {
  title: "QueryBuilder/Filters/DatePicker",
  component: DatePicker,
  argTypes: {},
};

export const Default: ComponentStory<typeof DatePicker> = args => {
  return <DatePicker {...args} />;
};
Default.args = {};
