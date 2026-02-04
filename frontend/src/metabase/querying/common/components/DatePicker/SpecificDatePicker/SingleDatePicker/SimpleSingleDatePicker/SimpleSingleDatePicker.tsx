import { SingleDatePickerBody } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/SingleDatePicker/SingleDatePickerBody";
import type { SingleDatePickerValue } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/SingleDatePicker/types";
import { TimeToggle } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/TimeToggle";
import { clearTimePart } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/utils";
import { Box, Stack } from "metabase/ui";

interface SimpleSingleDatePickerProps {
  value: SingleDatePickerValue;
  onChange: (value: SingleDatePickerValue) => void;
}

export function SimpleSingleDatePicker({
  value: { date, hasTime },
  onChange,
}: SimpleSingleDatePickerProps) {
  const handleDateChange = (newDate: Date) => {
    onChange({ date: newDate, hasTime });
  };

  const handleTimeToggle = () => {
    onChange({ date: clearTimePart(date), hasTime: !hasTime });
  };

  return (
    <Stack>
      <SingleDatePickerBody
        value={date}
        hasTime={hasTime}
        onChange={handleDateChange}
      />
      <Box>
        <TimeToggle pl={0} hasTime={hasTime} onClick={handleTimeToggle} />
      </Box>
    </Stack>
  );
}
