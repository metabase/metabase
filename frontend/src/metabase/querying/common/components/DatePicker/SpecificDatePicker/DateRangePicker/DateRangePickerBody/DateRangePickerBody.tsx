import dayjs from "dayjs";
import { useState } from "react";
import { t } from "ttag";

import {
  setDatePart,
  setTimePart,
} from "metabase/querying/common/components/DatePicker/SpecificDatePicker/utils";
import type { DatesRangeValue } from "metabase/ui";
import {
  DateInput,
  DatePicker,
  Group,
  Stack,
  Text,
  TimeInput,
} from "metabase/ui";

import S from "./DateRangePickerBody.module.css";

interface DateRangePickerBodyProps {
  value: [Date, Date];
  hasTime: boolean;
  onChange: (value: [Date, Date]) => void;
  valueFormat?: string;
}

export function DateRangePickerBody({
  value,
  hasTime,
  onChange,
  valueFormat = "LL",
}: DateRangePickerBodyProps) {
  const [startDate, endDate] = value;
  const [inProgressDateRange, setInProgressDateRange] =
    useState<DatesRangeValue | null>(value);
  const [displayedDate, setDisplayedDate] = useState(startDate);

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
    const newStartDate = setDatePart(startDate, newDate);
    onChange([newStartDate, endDate]);
    setInProgressDateRange(null);
    setDisplayedDate(newStartDate);
  };

  const handleEndDateChange = (newDate: Date) => {
    const newEndDate = setDatePart(endDate, newDate);
    onChange([startDate, newEndDate]);
    setInProgressDateRange(null);
    // subtract 1 month because we want the end date to be shown in the 2nd column
    setDisplayedDate(dayjs(newEndDate).subtract(1, "month").toDate());
  };

  const handleStartTimeChange = (newTime: Date | null) => {
    if (newTime) {
      const newStartDate = setTimePart(startDate, newTime);
      onChange([newStartDate, endDate]);
      setInProgressDateRange(null);
      setDisplayedDate(newStartDate);
    }
  };

  const handleEndTimeChange = (newTime: Date | null) => {
    if (newTime) {
      const newEndDate = setTimePart(endDate, newTime);
      onChange([startDate, newEndDate]);
      setInProgressDateRange(null);
      // subtract 1 month because we want the end date to be shown in the 2nd column
      setDisplayedDate(dayjs(newEndDate).subtract(1, "month").toDate());
    }
  };

  return (
    <Stack className={S.Root}>
      <Group align="center">
        <DateInput
          className={S.FlexDateInput}
          value={startDate}
          valueFormat={valueFormat}
          popoverProps={{ opened: false }}
          aria-label={t`Start date`}
          onChange={(val) => val && handleStartDateChange(dayjs(val).toDate())}
        />
        <Text c="text-tertiary">{t`and`}</Text>
        <DateInput
          className={S.FlexDateInput}
          value={endDate}
          valueFormat={valueFormat}
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
          <Text c="text-tertiary">{t`and`}</Text>
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
        date={displayedDate}
        numberOfColumns={2}
        allowSingleDateInRange
        onChange={handleRangeChange}
        onDateChange={(value) => setDisplayedDate(dayjs(value).toDate())}
      />
    </Stack>
  );
}
