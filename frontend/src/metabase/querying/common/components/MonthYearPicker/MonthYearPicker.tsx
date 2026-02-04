import dayjs from "dayjs";

import { Box, type DateValue, MonthPicker } from "metabase/ui";

import type { MonthYearPickerValue } from "../../types";

type MonthYearPickerProps = {
  value?: MonthYearPickerValue;
  onChange: (value: MonthYearPickerValue) => void;
};

export function MonthYearPicker({ value, onChange }: MonthYearPickerProps) {
  const date = value ? new Date(value.year, value.month - 1) : undefined;

  const handleChange = (value: DateValue) => {
    if (!value) {
      return;
    }
    const dateValue = dayjs.utc(value);

    onChange({
      type: "month",
      year: dateValue.year(),
      month: dateValue.month() + 1,
    });
  };

  return (
    <Box p="md">
      <MonthPicker value={date} defaultDate={date} onChange={handleChange} />
    </Box>
  );
}
