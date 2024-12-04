import type { StoryFn } from "@storybook/react";
import { type ComponentProps, useState } from "react";

import { AlertsEmailRecipientsSelector } from "./AlertsEmailRecipientsSelector";

export default {
  title: "Notifications/AlertsEmailRecipientsSelector",
  component: AlertsEmailRecipientsSelector,
};

const Template: StoryFn<
  ComponentProps<typeof AlertsEmailRecipientsSelector>
> = args => {
  const [data, setData] = useState(args.value);

  return (
    <AlertsEmailRecipientsSelector
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
