import dayjs from "dayjs";

import type { SpecificDatePickerValue } from "metabase/querying/filters/types";
import { Box, MonthPicker } from "metabase/ui";

type MonthYearPickerProps = {
  value?: SpecificDatePickerValue;
  onChange: (value: SpecificDatePickerValue) => void;
};

export function MonthYearPicker({ value, onChange }: MonthYearPickerProps) {
  const date = value?.values[0];

  const handleChange = (value: Date) => {
    const start = dayjs(value).startOf("month").toDate();
    const end = dayjs(value).add(1, "month").subtract(1, "day").toDate();
    onChange({
      type: "specific",
      operator: "between",
      values: [start, end],
      hasTime: false,
    });
  };

  return (
    <Box p="md">
      <MonthPicker value={date} onChange={handleChange} />
    </Box>
  );
}
