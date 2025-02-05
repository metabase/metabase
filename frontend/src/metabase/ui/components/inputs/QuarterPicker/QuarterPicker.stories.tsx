import { QuarterPicker } from "metabase/ui";

const args = {
  type: "default",
  allowDeselect: false,
  allowSingleDateInRange: false,
};

const sampleArgs = {
  date: new Date(2020, 0, 1),
};

const argTypes = {
  type: {
    options: ["default", "range", "multiple"],
    control: { type: "inline-radio" },
  },
  allowDeselect: {
    control: { type: "boolean" },
  },
  allowSingleDateInRange: {
    control: { type: "boolean" },
  },
};

export default {
  title: "Inputs/QuarterPicker",
  component: QuarterPicker,
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
