import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import { DateExcludeWidget } from "./DateExcludeWidget";

export default {
  title: "Parameters/DateExcludeWidget",
  component: DateExcludeWidget,
};

const Template: ComponentStory<typeof DateExcludeWidget> = () => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: string | null) => {
    updateArgs({ value: v });
  };

  const handleClose = () => {
    // noop
  };

  return (
    <DateExcludeWidget
      value={value}
      setValue={handleSetValue}
      onClose={handleClose}
    />
  );
};

export const Default = Template.bind({});
Default.args = {
  value: "",
};

export const DaysOfTheWeek = Template.bind({});
DaysOfTheWeek.args = {
  value: "exclude-days-Mon-Tue",
};

export const MonthsOfTheYear = Template.bind({});
MonthsOfTheYear.args = {
  value: "exclude-months-Sep-Oct",
};

export const QuartersOfTheYear = Template.bind({});
QuartersOfTheYear.args = {
  value: "exclude-quarters-3",
};

export const HoursOfTheDay = Template.bind({});
HoursOfTheDay.args = {
  value: "exclude-hours-17-21",
};
