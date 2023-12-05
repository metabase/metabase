import { useState } from "react";
import { Box, Stack } from "metabase/ui";
import { clearTimePart, hasTimeParts } from "../../utils";
import { SingleDatePickerBody } from "../SingleDatePickerBody";
import { TimeToggle } from "../../TimeToggle";

interface SimpleSingleDatePickerProps {
  value: Date;
  onChange: (value: Date) => void;
}

export function SimpleSingleDatePicker({
  value,
  onChange,
}: SimpleSingleDatePickerProps) {
  const [hasTime, setHasTime] = useState(hasTimeParts(value));

  const handleTimeToggle = () => {
    setHasTime(!hasTime);
    onChange(clearTimePart(value));
  };

  return (
    <Stack>
      <SingleDatePickerBody
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
