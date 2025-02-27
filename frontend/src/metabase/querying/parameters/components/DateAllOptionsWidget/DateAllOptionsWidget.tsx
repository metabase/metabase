import { useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { DatePicker } from "metabase/querying/filters/components/DatePicker";
import type {
  DatePickerOperator,
  DatePickerValue,
} from "metabase/querying/filters/types";
import {
  deserializeDateParameterValue,
  serializeDateParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import type { ParameterValueOrArray } from "metabase-types/api";

type DateAllOptionsWidgetProps = {
  value: ParameterValueOrArray | null | undefined;
  availableOperators?: DatePickerOperator[];
  submitButtonLabel?: string;
  onChange: (value: string) => void;
};

export function DateAllOptionsWidget({
  value,
  availableOperators,
  submitButtonLabel = t`Apply`,
  onChange,
}: DateAllOptionsWidgetProps) {
  const pickerValue = useMemo(() => getPickerValue(value), [value]);

  const handleChange = (newPickerValue: DatePickerValue) => {
    onChange(serializeDateParameterValue(newPickerValue));
  };

  return (
    <DatePicker
      value={pickerValue}
      availableOperators={availableOperators}
      submitButtonLabel={submitButtonLabel}
      onChange={handleChange}
    />
  );
}

function getPickerValue(
  value: ParameterValueOrArray | null | undefined,
): DatePickerValue | undefined {
  return match(deserializeDateParameterValue(value))
    .returnType<DatePickerValue | undefined>()
    .with({ type: P.union("specific", "relative", "exclude") }, value => value)
    .otherwise(() => undefined);
}
