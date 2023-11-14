import { useState } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import { Button, DatePicker, Divider, Group, Stack, Text } from "metabase/ui";
import type { DateValue, DatesRangeValue } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import {
  clearTimePart,
  hasTimeParts,
  setDatePart,
  setTimePart,
} from "../utils";
import { FlexDateInput, FlexTimeInput } from "./DateRangePicker.styled";

interface DateRangePickerProps {
  value: [Date, Date];
  isNew: boolean;
  onChange: (value: [Date, Date]) => void;
  onSubmit: () => void;
}

export function DateRangePicker({
  value: [startDate, endDate],
  isNew,
  onChange,
  onSubmit,
}: DateRangePickerProps) {
  const [hasTime, setHasTime] = useState(
    hasTimeParts(startDate) || hasTimeParts(endDate),
  );
  const [hasEndDate, setHasEndDate] = useState(true);

  const handleRangeChange = ([newStartDate, newEndDate]: DatesRangeValue) => {
    setHasEndDate(newEndDate != null);
    if (newStartDate && newEndDate) {
      onChange([
        setDatePart(startDate, newStartDate),
        setDatePart(endDate, newEndDate),
      ]);
    }
  };

  const handleStartDateChange = (newDate: DateValue) => {
    newDate && onChange([setDatePart(startDate, newDate), endDate]);
  };

  const handleEndDateChange = (newDate: DateValue) => {
    newDate && onChange([startDate, setDatePart(endDate, newDate)]);
  };

  const handleStartTimeChange = (newTime: Date) => {
    onChange([setTimePart(startDate, newTime), endDate]);
  };

  const handleEndTimeChange = (newTime: Date) => {
    onChange([startDate, setTimePart(endDate, newTime)]);
  };

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
      <Stack p="md">
        <Group align="center">
          <FlexDateInput
            value={startDate}
            popoverProps={{ opened: false }}
            aria-label={t`Start date`}
            onChange={handleStartDateChange}
          />
          <Text c="text.0">{t`and`}</Text>
          <FlexDateInput
            value={endDate}
            popoverProps={{ opened: false }}
            aria-label={t`End date`}
            onChange={handleEndDateChange}
          />
        </Group>
        {hasTime && (
          <Group align="center">
            <FlexTimeInput
              value={startDate}
              aria-label={t`Start time`}
              onChange={handleStartTimeChange}
            />
            <Text c="text.0">{t`and`}</Text>
            <FlexTimeInput
              value={endDate}
              aria-label={t`End time`}
              onChange={handleEndTimeChange}
            />
          </Group>
        )}
        <DatePicker
          type="range"
          value={[startDate, hasEndDate ? endDate : null]}
          defaultDate={startDate}
          numberOfColumns={2}
          allowSingleDateInRange
          onChange={handleRangeChange}
        />
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
        <Button variant="filled" type="submit">
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </form>
  );
}
