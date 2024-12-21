import type { DatePickerOperator } from "metabase/querying/filters/types";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";

const OPERATORS: DatePickerOperator[] = ["=", ">", "<", "between"];

export const SearchFilterDatePicker = ({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) => {
  return (
    <DateAllOptionsWidget
      value={value ?? undefined}
      availableOperators={OPERATORS}
      onChange={onChange}
    />
  );
};
