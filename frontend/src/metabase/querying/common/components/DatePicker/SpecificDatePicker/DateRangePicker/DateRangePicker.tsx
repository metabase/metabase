import type { FormEvent, ReactNode } from "react";

import { Box, Divider, Group } from "metabase/ui";

import { renderDefaultSubmitButton } from "../../utils";
import { TimeToggle } from "../TimeToggle";
import { clearTimePart } from "../utils";

import { DateRangePickerBody } from "./DateRangePickerBody";
import type { DateRangePickerValue } from "./types";

export type DateRangePickerProps = {
  value: DateRangePickerValue;
  hasTimeToggle: boolean;
  renderSubmitButton?: () => ReactNode;
  onChange: (value: DateRangePickerValue) => void;
  onSubmit: () => void;
};

export function DateRangePicker({
  value,
  hasTimeToggle,
  renderSubmitButton = renderDefaultSubmitButton,
  onChange,
  onSubmit,
}: DateRangePickerProps) {
  const { dateRange, hasTime } = value;
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
      <Group p="sm" justify={hasTimeToggle ? "space-between" : "flex-end"}>
        {hasTimeToggle && (
          <TimeToggle hasTime={hasTime} onClick={handleTimeToggle} />
        )}
        {renderSubmitButton()}
      </Group>
    </form>
  );
}
