import { ExcludeDatePicker } from "./ExcludeDatePicker";
import { DEFAULT_OPERATORS, DEFAULT_UNITS } from "./constants";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerValue,
  ExcludeDatePickerValue,
} from "./types";

export interface DatePickerProps {
  value?: DatePickerValue;
  availableOperators?: DatePickerOperator[];
  availableUnits?: DatePickerExtractionUnit[];
  onChange: (value: ExcludeDatePickerValue) => void;
}

export function DatePicker({
  value,
  availableOperators = DEFAULT_OPERATORS,
  availableUnits = DEFAULT_UNITS,
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
