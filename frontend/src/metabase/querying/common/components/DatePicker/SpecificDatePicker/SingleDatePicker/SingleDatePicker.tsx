import type { FormEvent, ReactNode } from "react";

import { Box, Divider, Group } from "metabase/ui";

import { renderDefaultSubmitButton } from "../../utils";
import { TimeToggle } from "../TimeToggle";
import { clearTimePart } from "../utils";

import { SingleDatePickerBody } from "./SingleDatePickerBody";
import type { SingleDatePickerValue } from "./types";

interface SingleDatePickerProps {
  value: SingleDatePickerValue;
  hasTimeToggle: boolean;
  renderSubmitButton?: () => ReactNode;
  onChange: (value: SingleDatePickerValue) => void;
  onSubmit: () => void;
}

export function SingleDatePicker({
  value,
  hasTimeToggle,
  renderSubmitButton = renderDefaultSubmitButton,
  onChange,
  onSubmit,
}: SingleDatePickerProps) {
  const { date, hasTime } = value;

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
      <Group p="sm" justify={hasTimeToggle ? "space-between" : "flex-end"}>
        {hasTimeToggle && (
          <TimeToggle hasTime={hasTime} onClick={handleTimeToggle} />
        )}
        {renderSubmitButton()}
      </Group>
    </form>
  );
}
