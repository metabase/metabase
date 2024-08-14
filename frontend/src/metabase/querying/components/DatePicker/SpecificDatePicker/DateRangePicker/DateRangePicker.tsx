import type { FormEvent } from "react";
import { t } from "ttag";

import { Box, Button, Divider, Group } from "metabase/ui";

import { TimeToggle } from "../TimeToggle";
import { clearTimePart } from "../utils";

import { DateRangePickerBody } from "./DateRangePickerBody";
import type { DateRangePickerValue } from "./types";

export interface DateRangePickerProps {
  value: DateRangePickerValue;
  isNew: boolean;
  onChange: (value: DateRangePickerValue) => void;
  onSubmit: () => void;
}

export function DateRangePicker({
  value: { dateRange, hasTime },
  isNew,
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
      <Group p="sm" position="apart">
        <TimeToggle hasTime={hasTime} onClick={handleTimeToggle} />
        <Button variant="filled" type="submit">
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </form>
  );
}
