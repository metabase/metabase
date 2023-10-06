import type { DateIntervalValue, DateOffsetIntervalValue } from "../types";

interface DateOffsetIntervalPickerProps {
  value: DateOffsetIntervalValue;
  isNew: boolean;
  onChange: (value: DateIntervalValue) => void;
  onSubmit: () => void;
}

export function DateOffsetIntervalPicker({
  value,
}: DateOffsetIntervalPickerProps) {
  return null;
}
