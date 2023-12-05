import { useState } from "react";
import { t } from "ttag";
import { DatePicker, Group, Stack, Text } from "metabase/ui";
import type { DatesRangeValue, DateValue } from "metabase/ui";
import { setDatePart, setTimePart } from "../../utils";
import { FlexDateInput, FlexTimeInput } from "./DateRangePickerBody.styled";

interface DateRangePickerBodyProps {
  value: [Date, Date];
  hasTime: boolean;
  onChange: (value: [Date, Date]) => void;
}

export function DateRangePickerBody({
  value: [startDate, endDate],
  hasTime,
  onChange,
}: DateRangePickerBodyProps) {
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

  return (
    <Stack>
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
  );
}
