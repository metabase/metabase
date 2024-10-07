import { Box, Stack } from "metabase/ui";

import { TimeToggle } from "../../TimeToggle";
import { clearTimePart } from "../../utils";
import { DateRangePickerBody } from "../DateRangePickerBody";
import type { DateRangePickerValue } from "../types";

interface SimpleDateRangePickerProps {
  value: DateRangePickerValue;
  onChange: (value: DateRangePickerValue) => void;
}

export function SimpleDateRangePicker({
  value: { dateRange, hasTime },
  onChange,
}: SimpleDateRangePickerProps) {
  const [startDate, endDate] = dateRange;

  const handleDateRangeChange = (newDateRange: [Date, Date]) => {
    onChange({ dateRange: newDateRange, hasTime });
  };

  const handleTimeToggle = () => {
    onChange({
      dateRange: [clearTimePart(startDate), clearTimePart(endDate)],
      hasTime: !hasTime,
    });
  };

  return (
    <Stack>
      <DateRangePickerBody
        value={dateRange}
        hasTime={hasTime}
        onChange={handleDateRangeChange}
      />
      <Box>
        <TimeToggle pl={0} hasTime={hasTime} onClick={handleTimeToggle} />
      </Box>
    </Stack>
  );
}
