import type {
  DatePickerOperator,
  DatePickerRelativeIntervalDirection,
  DatePickerShortcut,
} from "metabase/querying/filters/types";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";

const OPERATORS: DatePickerOperator[] = ["=", ">", "<", "between"];

type SearchFilterDatePickerProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  availableShortcuts?: DatePickerShortcut[];
  availableDirections?: DatePickerRelativeIntervalDirection[];
};

export const SearchFilterDatePicker = ({
  value,
  onChange,
  availableShortcuts,
  availableDirections,
}: SearchFilterDatePickerProps) => {
  return (
    <DateAllOptionsWidget
      value={value ?? undefined}
      availableOperators={OPERATORS}
      onChange={onChange}
      availableShortcuts={availableShortcuts}
      availableDirections={availableDirections}
    />
  );
};
