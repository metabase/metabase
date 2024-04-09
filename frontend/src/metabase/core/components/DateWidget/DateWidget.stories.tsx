import type { ComponentStory } from "@storybook/react";
import type { Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { useState } from "react";

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
