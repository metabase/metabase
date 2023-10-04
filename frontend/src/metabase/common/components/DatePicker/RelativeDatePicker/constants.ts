import type { RelativeDatePickerValue } from "metabase/common/components/DatePicker";

export const DEFAULT_VALUE: RelativeDatePickerValue = {
  type: "relative",
  unit: "day",
  value: -30,
  offsetUnit: null,
  offsetValue: null,
};
