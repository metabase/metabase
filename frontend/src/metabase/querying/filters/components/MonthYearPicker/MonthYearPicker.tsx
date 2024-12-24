import type { MonthYearPickerValue } from "metabase/querying/filters/types";
import { Box, MonthPicker } from "metabase/ui";

type MonthYearPickerProps = {
  value?: MonthYearPickerValue;
  onChange: (value: MonthYearPickerValue) => void;
};

export function MonthYearPicker({ value, onChange }: MonthYearPickerProps) {
  const date = value ? new Date(value.year, value.month - 1) : undefined;

  const handleChange = (value: Date) => {
    onChange({
      type: "month",
      year: value.getFullYear(),
      month: value.getMonth() + 1,
    });
  };

  return (
    <Box p="md">
      <MonthPicker value={date} defaultDate={date} onChange={handleChange} />
    </Box>
  );
}
