import dayjs from "dayjs";
import { useState } from "react";
import { t } from "ttag";

import type { DatesRangeValue } from "metabase/ui";
import {
  DateInput,
  DatePicker,
  Group,
  Stack,
  Text,
  TimeInput,
} from "metabase/ui";

import { setDatePart, setTimePart } from "../../utils";

import S from "./DateRangePickerBody.module.css";

interface DateRangePickerBodyProps {
  value: [Date, Date];
  hasTime: boolean;
  onChange: (value: [Date, Date]) => void;
}

export function DateRangePickerBody({
  value,
  hasTime,
  onChange,
}: DateRangePickerBodyProps) {
  const [startDate, endDate] = value;
  const [inProgressDateRange, setInProgressDateRange] =
    useState<DatesRangeValue | null>(value);

  const handleRangeChange = (newDateRange: DatesRangeValue) => {
    const [newStartDate, newEndDate] = newDateRange;
    if (newStartDate && newEndDate) {
      onChange([
        setDatePart(startDate, dayjs(newStartDate).toDate()),
        setDatePart(endDate, dayjs(newEndDate).toDate()),
      ]);
      setInProgressDateRange(null);
    } else {
      setInProgressDateRange(newDateRange);
    }
  };

  const handleStartDateChange = (newDate: Date) => {
    newDate && onChange([setDatePart(startDate, newDate), endDate]);
  };

  const handleEndDateChange = (newDate: Date) => {
    newDate && onChange([startDate, setDatePart(endDate, newDate)]);
  };

  const handleStartTimeChange = (newTime: Date | null) => {
    newTime && onChange([setTimePart(startDate, newTime), endDate]);
  };

  const handleEndTimeChange = (newTime: Date | null) => {
    newTime && onChange([startDate, setTimePart(endDate, newTime)]);
  };

  return (
    <Stack className={S.Root}>
      <Group align="center">
        <DateInput
          className={S.FlexDateInput}
          value={startDate}
          popoverProps={{ opened: false }}
          aria-label={t`Start date`}
          onChange={(val) => val && handleStartDateChange(dayjs(val).toDate())}
        />
        <Text c="text-light">{t`and`}</Text>
        <DateInput
          className={S.FlexDateInput}
          value={endDate}
          popoverProps={{ opened: false }}
          aria-label={t`End date`}
          onChange={(val) => val && handleEndDateChange(dayjs(val).toDate())}
        />
      </Group>
      {hasTime && (
        <Group align="center">
          <TimeInput
            className={S.FlexTimeInput}
            value={startDate}
            aria-label={t`Start time`}
            onChange={handleStartTimeChange}
          />
          <Text c="text-light">{t`and`}</Text>
          <TimeInput
            className={S.FlexTimeInput}
            value={endDate}
            aria-label={t`End time`}
            onChange={handleEndTimeChange}
          />
        </Group>
      )}
      <DatePicker
        type="range"
        value={inProgressDateRange ?? value}
        defaultDate={startDate}
        numberOfColumns={2}
        allowSingleDateInRange
        onChange={handleRangeChange}
      />
    </Stack>
  );
}
