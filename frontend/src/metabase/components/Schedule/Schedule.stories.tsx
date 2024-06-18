import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import { Schedule } from "./Schedule";

export default {
  title: "Components/Schedule",
  component: Schedule,
};

const Template: ComponentStory<typeof Schedule> = args => {
  const [
    {
      schedule,
      scheduleOptions = ["hourly", "daily", "weekly", "monthly"],
      timezone = "UTC",
    },
    updateArgs,
  ] = useArgs();
  const handleChange = (schedule: unknown) => updateArgs({ schedule });
  return (
    <Schedule
      {...args}
      schedule={schedule}
      scheduleOptions={scheduleOptions}
      timezone={timezone}
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
  verb: "Deliver",
};
