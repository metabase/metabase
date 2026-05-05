import { DateTimePicker } from "metabase/ui";

const args = {};

const sampleArgs = {
  date1: new Date(2023, 9, 8, 9, 1, 2),
  date2: new Date(2023, 9, 24, 10, 2, 3),
  date3: new Date(2023, 9, 16, 23, 54, 0),
};

const argTypes = {};

export default {
  title: "Components/Inputs/DateTimePicker",
  component: DateTimePicker,
  args,
  argTypes,
};

export const Default = {
  args: {
    defaultValue: sampleArgs.date1,
  },
};

export const WithSeconds = {
  args: {
    defaultValue: sampleArgs.date2,
    withSeconds: true,
  },
};

export const ValueFormat = {
  args: {
    defaultValue: sampleArgs.date3,
    valueFormat: "HH:mm on YYYY-MM-DD",
  },
};
