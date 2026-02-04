import dayjs from "dayjs";

import type { QuarterYearPickerValue } from "metabase/querying/filters/types";
import { Box, type DateValue, QuarterPicker } from "metabase/ui";

type QuarterYearPickerProps = {
  value?: QuarterYearPickerValue;
  onChange: (value: QuarterYearPickerValue) => void;
};

export function QuarterYearPicker({ value, onChange }: QuarterYearPickerProps) {
  const date = value
    ? dayjs().year(value.year).quarter(value.quarter).toDate()
    : undefined;

  const handleChange = (value: DateValue) => {
    const date = dayjs(value);
    onChange({
      type: "quarter",
      year: date.year(),
      quarter: date.quarter(),
    });
  };

  return (
    <Box p="md">
      <QuarterPicker value={date} defaultDate={date} onChange={handleChange} />
    </Box>
  );
}
