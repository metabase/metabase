import { useMemo } from "react";

import { DatePicker } from "metabase/querying/filters/components/DatePicker";
import type {
  DatePickerOperator,
  DatePickerValue,
} from "metabase/querying/filters/types";
import {
  deserializeDateFilter,
  serializeDateFilter,
} from "metabase/querying/parameters/utils/dates";

type DateAllOptionsWidgetProps = {
  value: string | undefined;
  availableOperators?: DatePickerOperator[];
  submitButtonLabel?: string;
  onChange: (value: string) => void;
};

export function DateAllOptionsWidget({
  value,
  availableOperators,
  submitButtonLabel,
  onChange,
}: DateAllOptionsWidgetProps) {
  const filter = useMemo(
    () => (value != null ? deserializeDateFilter(value) : undefined),
    [value],
  );

  const handleChange = (filter: DatePickerValue) => {
    onChange(serializeDateFilter(filter));
  };

  return (
    <DatePicker
      value={filter}
      availableOperators={availableOperators}
      submitButtonLabel={submitButtonLabel}
      onChange={handleChange}
    />
  );
}
