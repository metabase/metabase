import { useState } from "react";
import { t } from "ttag";
import { Button, DatePicker, Divider, Group, Stack, Text } from "metabase/ui";
import type { DateValue } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { clearTimePart, setDatePart, setTimePart } from "../utils";
import { FlexDateInput, FlexTimeInput } from "./DateRangePicker.styled";

interface DateRangePickerProps {
  value: [Date, Date];
  isNew: boolean;
  onChange: (value: [Date, Date]) => void;
  onSubmit: () => void;
}

export function DateRangePicker({
  value: [initialStartDate, initialEndDate],
  isNew,
  onChange,
  onSubmit,
}: DateRangePickerProps) {
  const [startDate, setStartDate] = useState<Date>(initialStartDate);
  const [endDate, setEndDate] = useState<Date>(initialEndDate);
  const [hasTime, setHasTime] = useState(false);
  const isValid = startDate != null && endDate != null;

  const handleRangeChange = (newStartDate: Date, newEndDate: Date) => {
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    onChange([newStartDate, newEndDate]);
  };

  const handleStartDateChange = (newStartDate: DateValue) => {
    if (newStartDate) {
      handleRangeChange(setDatePart(startDate, newStartDate), endDate);
    }
  };

  const handleEndDateChange = (newEndDate: DateValue) => {
    if (newEndDate) {
      handleRangeChange(startDate, setDatePart(endDate, newEndDate));
    }
  };

  const handleStartTimeChange = (newStartTime: Date) => {
    handleStartDateChange(setTimePart(startDate, newStartTime));
  };

  const handleEndTimeChange = (newEndTime: Date) => {
    handleEndDateChange(setTimePart(endDate, newEndTime));
  };

  const handleTimeToggle = () => {
    setHasTime(!hasTime);
    handleRangeChange(clearTimePart(startDate), clearTimePart(endDate));
  };

  return (
    <div>
      <Stack p="md">
        <Group align="center">
          <FlexDateInput
            value={startDate}
            popoverProps={{ opened: false }}
            onChange={handleStartDateChange}
          />
          <Text>{t`and`}</Text>
          <FlexDateInput
            value={endDate}
            popoverProps={{ opened: false }}
            onChange={handleEndDateChange}
          />
        </Group>
        {hasTime && (
          <Group align="center">
            <FlexTimeInput value={startDate} onChange={handleStartTimeChange} />
            <Text>{t`and`}</Text>
            <FlexTimeInput value={endDate} onChange={handleEndTimeChange} />
          </Group>
        )}
        <Stack align="center">
          <DatePicker
            type="range"
            value={[startDate, endDate]}
            defaultDate={initialEndDate}
            allowSingleDateInRange
            onChange={handleRangeChange}
          />
        </Stack>
      </Stack>
      <Divider />
      <Group p="sm" position="apart">
        <Button
          c="text.1"
          variant="subtle"
          leftIcon={<Icon name="clock" />}
          onClick={handleTimeToggle}
        >
          {hasTime ? t`Remove time` : t`Add time`}
        </Button>
        <Button variant="filled" disabled={!isValid} onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
