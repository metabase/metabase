import type {
  DatePickerOperator,
  DatePickerShortcut,
} from "metabase/querying/filters/types";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";

const OPERATORS: DatePickerOperator[] = ["=", ">", "<", "between"];

export const SearchFilterDatePicker = ({
  value,
  onChange,
  availableShortcuts,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  availableShortcuts?: DatePickerShortcut[];
}) => {
  return (
    <DateAllOptionsWidget
      value={value ?? undefined}
      availableOperators={OPERATORS}
      onChange={onChange}
      availableShortcuts={availableShortcuts}
    />
  );
};
