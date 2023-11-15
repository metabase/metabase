import type { RelativeDatePickerValue } from "../../types";
import { isIntervalValue } from "../utils";
import { SimpleCurrentDatePicker } from "../CurrentDatePicker";
import { SimpleDateIntervalPicker } from "../DateIntervalPicker";

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
    <SimpleCurrentDatePicker value={value} onChange={onChange} />
  );
}
