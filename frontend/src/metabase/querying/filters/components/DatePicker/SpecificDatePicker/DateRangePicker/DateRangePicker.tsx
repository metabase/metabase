import type { FormEvent } from "react";

import { Box, Button, Divider, Group } from "metabase/ui";

import { TimeToggle } from "../TimeToggle";
import { clearTimePart } from "../utils";

import { DateRangePickerBody } from "./DateRangePickerBody";
import type { DateRangePickerValue } from "./types";

export interface DateRangePickerProps {
  value: DateRangePickerValue;
  submitButtonLabel: string;
  hasTimeToggle: boolean;
  onChange: (value: DateRangePickerValue) => void;
  onSubmit: () => void;
}

export function DateRangePicker({
  value: { dateRange, hasTime },
  submitButtonLabel,
  hasTimeToggle,
  onChange,
  onSubmit,
}: DateRangePickerProps) {
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Box p="md">
        <DateRangePickerBody
          value={dateRange}
          hasTime={hasTime}
          onChange={handleDateRangeChange}
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
