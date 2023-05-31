import { useState } from "react";
import moment from "moment-timezone";
import type { ComponentStory } from "@storybook/react";
import DateSelector from "./DateSelector";

export default {
  title: "Core/DateSelector",
  component: DateSelector,
};

const Template: ComponentStory<typeof DateSelector> = args => {
  const [value, setValue] = useState(args.value);
  return <DateSelector {...args} value={value} onChange={setValue} />;
};

export const Default = Template.bind({});

export const WithTime = Template.bind({});
WithTime.args = {
  value: moment("2015-01-01"),
  hasTime: true,
};
