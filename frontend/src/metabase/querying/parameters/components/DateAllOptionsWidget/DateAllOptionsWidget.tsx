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
  value: text,
  availableOperators,
  submitButtonLabel,
  onChange,
}: DateAllOptionsWidgetProps) {
  const value = useMemo(
    () => (text != null ? deserializeDateFilter(text) : undefined),
    [text],
  );

  const handleChange = (value: DatePickerValue) => {
    onChange(serializeDateFilter(value));
  };

  return (
    <DatePicker
      value={value}
      availableOperators={availableOperators}
      submitButtonLabel={submitButtonLabel}
      onChange={handleChange}
    />
  );
}
