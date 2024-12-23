import dayjs from "dayjs";

import type { SpecificDatePickerValue } from "metabase/querying/filters/types";
import { MonthPicker } from "metabase/ui";

type MonthYearPickerProps = {
  value?: SpecificDatePickerValue;
  onChange: (value: SpecificDatePickerValue) => void;
};

export function MonthYearPicker({ value, onChange }: MonthYearPickerProps) {
  const date = value?.values[0];

  const handleChange = (value: Date) => {
    const start = dayjs(value).startOf("month").toDate();
    const end = dayjs(value).endOf("month").toDate();
    onChange({
      type: "specific",
      operator: "between",
      values: [start, end],
      hasTime: false,
    });
  };

  return <MonthPicker value={date} onChange={handleChange} />;
}
