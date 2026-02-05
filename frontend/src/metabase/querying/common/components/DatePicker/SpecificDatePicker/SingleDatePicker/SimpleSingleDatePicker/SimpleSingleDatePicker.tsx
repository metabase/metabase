import { Box, Stack } from "metabase/ui";

import { TimeToggle } from "../../TimeToggle";
import { clearTimePart } from "../../utils";
import { SingleDatePickerBody } from "../SingleDatePickerBody";
import type { SingleDatePickerValue } from "../types";

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
