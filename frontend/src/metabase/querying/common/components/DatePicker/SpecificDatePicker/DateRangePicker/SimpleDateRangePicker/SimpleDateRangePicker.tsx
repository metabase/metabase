import { DateRangePickerBody } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/DateRangePicker/DateRangePickerBody";
import type { DateRangePickerValue } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/DateRangePicker/types";
import { TimeToggle } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/TimeToggle";
import { clearTimePart } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/utils";
import { Box, Stack } from "metabase/ui";

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
