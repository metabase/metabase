import type { StoryFn } from "@storybook/react";
import { type ComponentProps, useState } from "react";

import { MultipleEmailsInput } from "./MultipleEmailsInput";

export default {
  title: "Notifications/MultipleEmailsInput",
  component: MultipleEmailsInput,
};

const Template: StoryFn<ComponentProps<typeof MultipleEmailsInput>> = args => {
  const [data, setData] = useState(args.value);

  return (
    <MultipleEmailsInput
      value={data}
      onChange={newValue => {
        setData(newValue);
      }}
    />
  );
};

export const Default = {
  render: Template,

  args: {
    value: [
      "vito@metabase.com",
      "john@gmail.com",
      "paul@gmail.com",
      "george@gmail.com",
      "ringo@gmail.com",
    ],
  },
};
