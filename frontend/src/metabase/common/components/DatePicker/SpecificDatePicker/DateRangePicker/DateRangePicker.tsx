import { useState } from "react";
import { t } from "ttag";
import { Button, DatePicker, Divider, Group, Stack, Text } from "metabase/ui";
import type { DateValue, DatesRangeValue } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { clearTime, setTime } from "../utils";
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

  const handleRangeChange = ([newStartDate, newEndDate]: DatesRangeValue) => {
    if (newStartDate != null && newEndDate != null) {
      setStartDate(newStartDate);
      setEndDate(newEndDate);
      onChange([newStartDate, newEndDate]);
    }
  };

  const handleStartDateChange = (newStartDate: DateValue) => {
    handleRangeChange([newStartDate, endDate]);
  };

  const handleEndDateChange = (newEndDate: DateValue) => {
    handleRangeChange([startDate, newEndDate]);
  };

  const handleStartTimeChange = (newStartTime: Date) => {
    handleStartDateChange(setTime(startDate, newStartTime));
  };

  const handleEndTimeChange = (newEndTime: Date) => {
    handleEndDateChange(setTime(endDate, newEndTime));
  };

  const handleTimeToggle = () => {
    setHasTime(!hasTime);
    handleRangeChange([clearTime(startDate), clearTime(endDate)]);
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
