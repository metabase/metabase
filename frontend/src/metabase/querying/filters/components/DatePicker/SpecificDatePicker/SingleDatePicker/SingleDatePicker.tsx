import type { FormEvent } from "react";

import { Box, Button, Divider, Group } from "metabase/ui";

import { TimeToggle } from "../TimeToggle";
import { clearTimePart } from "../utils";

import { SingleDatePickerBody } from "./SingleDatePickerBody";
import type { SingleDatePickerValue } from "./types";

interface SingleDatePickerProps {
  value: SingleDatePickerValue;
  submitButtonLabel: string;
  hasTimeToggle: boolean;
  onChange: (value: SingleDatePickerValue) => void;
  onSubmit: () => void;
}

export function SingleDatePicker({
  value: { date, hasTime },
  submitButtonLabel,
  hasTimeToggle,
  onChange,
  onSubmit,
}: SingleDatePickerProps) {
  const handleDateChange = (newDate: Date) => {
    onChange({ date: newDate, hasTime });
  };

  const handleTimeToggle = () => {
    onChange({ date: clearTimePart(date), hasTime: !hasTime });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Box p="md">
        <SingleDatePickerBody
          value={date}
          hasTime={hasTime}
          onChange={handleDateChange}
        />
      </Box>
      <Divider />
      <Group p="sm" position={hasTimeToggle ? "apart" : "right"}>
        {hasTimeToggle && (
          <TimeToggle hasTime={hasTime} onClick={handleTimeToggle} />
        )}
        <Button variant="filled" type="submit">
          {submitButtonLabel}
        </Button>
      </Group>
    </form>
  );
}
