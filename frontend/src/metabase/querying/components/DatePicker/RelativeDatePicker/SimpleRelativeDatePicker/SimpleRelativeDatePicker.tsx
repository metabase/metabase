import type { RelativeDatePickerValue } from "../../types";
import { CurrentDatePicker } from "../CurrentDatePicker";
import { SimpleDateIntervalPicker } from "../DateIntervalPicker";
import { isIntervalValue } from "../utils";

interface SimpleRelativeDatePickerProps {
  value: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
}

export function SimpleRelativeDatePicker({
  value,
  onChange,
}: SimpleRelativeDatePickerProps) {
  return isIntervalValue(value) ? (
    <SimpleDateIntervalPicker value={value} onChange={onChange} />
  ) : (
    <CurrentDatePicker value={value} onChange={onChange} />
  );
}
