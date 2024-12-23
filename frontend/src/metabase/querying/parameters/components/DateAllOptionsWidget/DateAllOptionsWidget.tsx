import { useMemo } from "react";
import { P, match } from "ts-pattern";
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
  const value = useMemo(() => getPickerValue(valueText), [valueText]);

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

function getPickerValue(
  valueText: string | undefined,
): DatePickerValue | undefined {
  const value =
    valueText != null ? deserializeDateFilter(valueText) : undefined;
  return match(value)
    .returnType<DatePickerValue | undefined>()
    .with({ type: P.union("specific", "relative", "exclude") }, value => value)
    .otherwise(() => undefined);
}
