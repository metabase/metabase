import { useMemo } from "react";
import { t } from "ttag";

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
  value: valueText,
  availableOperators,
  submitButtonLabel = t`Apply`,
  onChange,
}: DateAllOptionsWidgetProps) {
  const value = useMemo(
    () => (valueText != null ? deserializeDateFilter(valueText) : undefined),
    [valueText],
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
