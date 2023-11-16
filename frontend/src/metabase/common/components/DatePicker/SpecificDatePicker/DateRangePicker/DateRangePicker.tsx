import type { FormEvent } from "react";
import { useState } from "react";
import { t } from "ttag";
import { Box, Button, Divider, Group } from "metabase/ui";
import { TimeToggle } from "../TimeToggle";
import { clearTimePart, hasTimeParts } from "../utils";
import { DateRangePickerBody } from "./DateRangePickerBody";

interface DateRangePickerProps {
  value: [Date, Date];
  isNew: boolean;
  onChange: (value: [Date, Date]) => void;
  onSubmit: () => void;
}

export function DateRangePicker({
  value,
  isNew,
  onChange,
  onSubmit,
}: DateRangePickerProps) {
  const [startDate, endDate] = value;
  const [hasTime, setHasTime] = useState(
    hasTimeParts(startDate) || hasTimeParts(endDate),
  );

  const handleTimeToggle = () => {
    setHasTime(!hasTime);
    onChange([clearTimePart(startDate), clearTimePart(endDate)]);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Box p="md">
        <DateRangePickerBody
          value={value}
          hasTime={hasTime}
          onChange={onChange}
        />
      </Box>
      <Divider />
      <Group p="sm" position="apart">
        <TimeToggle hasTime={hasTime} onClick={handleTimeToggle} />
        <Button variant="filled" type="submit">
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </form>
  );
}
