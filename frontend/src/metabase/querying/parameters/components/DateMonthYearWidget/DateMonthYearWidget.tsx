import { useMemo } from "react";
import { match } from "ts-pattern";

import { MonthYearPicker } from "metabase/querying/filters/components/MonthYearPicker";
import type { MonthYearPickerValue } from "metabase/querying/filters/types";
import {
  deserializeDateFilter,
  serializeDateFilter,
} from "metabase/querying/parameters/utils/dates";

type DateMonthYearPickerProps = {
  value: string | undefined;
  onChange: (value: string) => void;
};

export function DateMonthYearWidget({
  value: valueText,
  onChange,
}: DateMonthYearPickerProps) {
  const value = useMemo(() => getPickerValue(valueText), [valueText]);

  const handleChange = (value: MonthYearPickerValue) => {
    onChange(serializeDateFilter(value));
  };

  return <MonthYearPicker value={value} onChange={handleChange} />;
}

function getPickerValue(
  valueText: string | undefined,
): MonthYearPickerValue | undefined {
  const value =
    valueText != null ? deserializeDateFilter(valueText) : undefined;
  return match(value)
    .returnType<MonthYearPickerValue | undefined>()
    .with({ type: "month" }, value => value)
    .otherwise(() => undefined);
}
