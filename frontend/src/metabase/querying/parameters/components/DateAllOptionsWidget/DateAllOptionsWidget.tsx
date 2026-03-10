import { useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { DatePicker } from "metabase/querying/common/components/DatePicker";
import type {
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/common/types";
import {
  deserializeDateParameterValue,
  serializeDateParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import { Button } from "metabase/ui";
import type { ParameterValueOrArray } from "metabase-types/api";

type DateAllOptionsWidgetProps = {
  value: ParameterValueOrArray | null | undefined;
  availableOperators?: DatePickerOperator[];
  availableShortcuts?: DatePickerShortcut[];
  availableDirections?: RelativeIntervalDirection[];
  submitButtonLabel?: string;
  onChange: (value: string) => void;
};

export function DateAllOptionsWidget({
  value,
  availableOperators,
  availableDirections,
  submitButtonLabel = t`Apply`,
  onChange,
  availableShortcuts,
}: DateAllOptionsWidgetProps) {
  const pickerValue = useMemo(() => getPickerValue(value), [value]);

  const handleChange = (newPickerValue: DatePickerValue) => {
    onChange(serializeDateParameterValue(newPickerValue));
  };

  return (
    <DatePicker
      value={pickerValue}
      availableOperators={availableOperators}
      availableShortcuts={availableShortcuts}
      availableDirections={availableDirections}
      renderSubmitButton={({ isDisabled }) => (
        <Button type="submit" variant="filled" disabled={isDisabled}>
          {submitButtonLabel}
        </Button>
      )}
      onChange={handleChange}
    />
  );
}

function getPickerValue(
  value: ParameterValueOrArray | null | undefined,
): DatePickerValue | undefined {
  return match(deserializeDateParameterValue(value))
    .returnType<DatePickerValue | undefined>()
    .with(
      { type: P.union("specific", "relative", "exclude") },
      (value) => value,
    )
    .otherwise(() => undefined);
}
