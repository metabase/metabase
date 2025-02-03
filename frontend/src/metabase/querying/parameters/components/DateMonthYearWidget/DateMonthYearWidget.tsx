import { useMemo } from "react";
import { match } from "ts-pattern";

import { MonthYearPicker } from "metabase/querying/filters/components/MonthYearPicker";
import type { MonthYearPickerValue } from "metabase/querying/filters/types";
import { serializeDateParameterValue } from "metabase/querying/parameters/utils/dates";
import { normalizeDateParameterValue } from "metabase/querying/parameters/utils/normalize";
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
  return match(normalizeDateParameterValue(value))
    .returnType<MonthYearPickerValue | undefined>()
    .with({ type: "month" }, value => value)
    .otherwise(() => undefined);
}
