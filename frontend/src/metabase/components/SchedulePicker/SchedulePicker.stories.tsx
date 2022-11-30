import React from "react";

import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";

import SchedulePicker from "./SchedulePicker";

export default {
  title: "Components/SchedulePicker",
  component: SchedulePicker,
};

const Template: ComponentStory<typeof SchedulePicker> = args => {
  const [{ schedule }, updateArgs] = useArgs();
  const handleChange = (schedule: unknown) => updateArgs({ schedule });
  return (
    <SchedulePicker
      {...args}
      schedule={schedule}
      onScheduleChange={handleChange}
    />
  );
};

export const Default = Template.bind({});
Default.args = {
  schedule: {
    schedule_day: "mon",
    schedule_frame: null,
    schedule_hour: 0,
    schedule_type: "daily",
  },
  scheduleOptions: ["daily", "weekly", "monthly"],
  timezone: "UTC",
};
