import { useMemo } from "react";
import { match } from "ts-pattern";

import { MonthYearPicker } from "metabase/querying/common/components/MonthYearPicker";
import type { MonthYearPickerValue } from "metabase/querying/common/types";
import {
  deserializeDateParameterValue,
  serializeDateParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import type { ParameterValueOrArray } from "metabase-types/api";

type DateMonthYearPickerProps = {
  value: ParameterValueOrArray | null | undefined;
  onChange: (value: string) => void;
};

export function DateMonthYearWidget({
  value,
  onChange,
}: DateMonthYearPickerProps) {
  const pickerValue = useMemo(() => getPickerValue(value), [value]);

  const handleChange = (newPickerValue: MonthYearPickerValue) => {
    onChange(serializeDateParameterValue(newPickerValue));
  };

  return <MonthYearPicker value={pickerValue} onChange={handleChange} />;
}

function getPickerValue(
  value: ParameterValueOrArray | null | undefined,
): MonthYearPickerValue | undefined {
  return match(deserializeDateParameterValue(value))
    .returnType<MonthYearPickerValue | undefined>()
    .with({ type: "month" }, (value) => value)
    .otherwise(() => undefined);
}
