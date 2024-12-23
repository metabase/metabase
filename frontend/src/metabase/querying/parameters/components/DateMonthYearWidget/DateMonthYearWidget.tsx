import { useMemo } from "react";

import { MonthYearPicker } from "metabase/querying/filters/components/MonthYearPicker";
import type { SpecificDatePickerValue } from "metabase/querying/filters/types";
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

  const handleChange = (value: SpecificDatePickerValue) => {
    onChange(serializeDateFilter(value));
  };

  return <MonthYearPicker value={value} onChange={handleChange} />;
}

function getPickerValue(
  valueText: string | undefined,
): SpecificDatePickerValue | undefined {
  const value =
    valueText != null ? deserializeDateFilter(valueText) : undefined;
  if (
    value != null &&
    value.type === "specific" &&
    value.operator === "between"
  ) {
    return value;
  }
}
