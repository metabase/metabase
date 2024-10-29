import type { StoryFn } from "@storybook/react";
import type { Moment } from "moment-timezone";
import { useState } from "react";

import DateWidget from "./DateWidget";

export default {
  title: "Core/DateWidget",
  component: DateWidget,
};

const Template: StoryFn<typeof DateWidget> = args => {
  const [value, setValue] = useState<Moment>();
  return <DateWidget {...args} value={value} onChange={setValue} />;
};

export const Default = {
  render: Template,
};

export const WithTime = {
  render: Template,

  args: {
    hasTime: true,
  },
};
