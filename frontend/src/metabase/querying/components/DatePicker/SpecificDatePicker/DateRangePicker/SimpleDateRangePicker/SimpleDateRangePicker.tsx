import { useState } from "react";
import { Box, Stack } from "metabase/ui";
import { TimeToggle } from "../../TimeToggle";
import { clearTimePart, hasTimeParts } from "../../utils";
import { DateRangePickerBody } from "../DateRangePickerBody";

interface SimpleDateRangePickerProps {
  value: [Date, Date];
  onChange: (value: [Date, Date]) => void;
}

export function SimpleDateRangePicker({
  value,
  onChange,
}: SimpleDateRangePickerProps) {
  const [startDate, endDate] = value;
  const [hasTime, setHasTime] = useState(
    hasTimeParts(startDate) || hasTimeParts(endDate),
  );

  const handleTimeToggle = () => {
    setHasTime(!hasTime);
    onChange([clearTimePart(startDate), clearTimePart(endDate)]);
  };

  return (
    <Stack>
      <DateRangePickerBody
        value={value}
        hasTime={hasTime}
        onChange={onChange}
      />
      <Box>
        <TimeToggle pl={0} hasTime={hasTime} onClick={handleTimeToggle} />
      </Box>
    </Stack>
  );
}
