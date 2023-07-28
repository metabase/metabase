import { useState } from "react";
import { Moment } from "moment-timezone";
import type { ComponentStory } from "@storybook/react";
import DateWidget from "./DateWidget";

export default {
  title: "Core/DateWidget",
  component: DateWidget,
};

const Template: ComponentStory<typeof DateWidget> = args => {
  const [value, setValue] = useState<Moment>();
  return <DateWidget {...args} value={value} onChange={setValue} />;
};

export const Default = Template.bind({});

export const WithTime = Template.bind({});
WithTime.args = {
  hasTime: true,
};
