import { MonthPicker } from "metabase/ui";

const args = {
  allowDeselect: undefined,
};

const sampleArgs = {
  date: new Date(2020, 0, 1),
};

const argTypes = {
  allowDeselect: {
    control: { type: "boolean" },
  },
};

export default {
  title: "Inputs/MonthPicker",
  component: MonthPicker,
  args,
  argTypes,
};

export const Default = {
  args: {
    defaultDate: sampleArgs.date,
  },
};

export const AllowDeselect = {
  name: "Allow deselect",
  args: {
    allowDeselect: true,
    defaultValue: sampleArgs.date,
    defaultDate: sampleArgs.date,
  },
};
