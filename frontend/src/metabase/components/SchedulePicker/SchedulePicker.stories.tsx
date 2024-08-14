import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import SchedulePicker from "./SchedulePicker";

export default {
  title: "Components/SchedulePicker",
  component: SchedulePicker,
};

const Template: ComponentStory<typeof SchedulePicker> = args => {
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

export const Default = Template.bind({});
Default.args = {
  schedule: {
    schedule_day: "mon",
    schedule_frame: null,
    schedule_hour: 0,
    schedule_type: "daily",
  },
  textBeforeInterval: "Deliver",
};
