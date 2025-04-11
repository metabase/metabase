import type { StoryFn } from "@storybook/react";
import type { Dayjs } from "dayjs";
import { useState } from "react";

import DateWidget from "./DateWidget";

export default {
  title: "Components/Ask Before Using/DateWidget",
  component: DateWidget,
};

const Template: StoryFn<typeof DateWidget> = (args) => {
  const [value, setValue] = useState<Dayjs>();
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
