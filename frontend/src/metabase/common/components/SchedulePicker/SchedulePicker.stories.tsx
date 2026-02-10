import type { StoryFn } from "@storybook/react-webpack5";
import { useArgs } from "storybook/preview-api";

import { SchedulePicker } from "./SchedulePicker";

export default {
  title: "Deprecated/Components/SchedulePicker",
  component: SchedulePicker,
};

const Template: StoryFn<typeof SchedulePicker> = (args) => {
  const [
    {
      schedule,
      scheduleOptions = ["daily", "weekly", "monthly"],
      timezone = "UTC",
    },
    updateArgs,
  ] = useArgs();
  const handleChange = (schedule: unknown) => updateArgs({ schedule });
  return (
    <SchedulePicker
      {...args}
      schedule={schedule}
      scheduleOptions={scheduleOptions}
      timezone={timezone}
      onScheduleChange={handleChange}
    />
  );
};

export const Default = {
  render: Template,

  args: {
    schedule: {
      schedule_day: "mon",
      schedule_frame: null,
      schedule_hour: 0,
      schedule_type: "daily",
    },
    textBeforeInterval: "Deliver",
  },
};
