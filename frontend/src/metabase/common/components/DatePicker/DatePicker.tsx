import { ExcludeDatePicker } from "./ExcludeDatePicker";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerValue,
  ExcludeDatePickerValue,
} from "./types";

export interface DatePickerProps {
  value?: DatePickerValue;
  availableOperators: DatePickerOperator[];
  availableUnits: DatePickerExtractionUnit[];
  onChange: (value: ExcludeDatePickerValue) => void;
}

export function DatePicker({
  value,
  availableOperators,
  availableUnits,
  onChange,
}: DatePickerProps) {
  return (
    <ExcludeDatePicker
      value={value}
      availableOperators={availableOperators}
      availableUnits={availableUnits}
      onChange={onChange}
    />
  );
}
