import type { DateStringValue } from "@mantine/dates";
import dayjs from "dayjs";
import { useState } from "react";
import { t } from "ttag";

import {
  setDatePart,
  setTimePart,
} from "metabase/querying/common/components/DatePicker/SpecificDatePicker/utils";
import { DateInput, DatePicker, Stack, TimeInput } from "metabase/ui";

interface SingleDatePickerBodyProps {
  value: Date;
  hasTime: boolean;
  onChange: (value: Date) => void;
}

export function SingleDatePickerBody({
  value,
  hasTime,
  onChange,
}: SingleDatePickerBodyProps) {
  const [date, setDate] = useState<Date>(value);

  const handleDateChange = (newDate: DateStringValue | null) => {
    if (newDate) {
      onChange(setDatePart(value, dayjs(newDate).toDate()));
    }
  };

  const handleTimeChange = (newTime: Date | null) => {
    if (newTime) {
      onChange(setTimePart(value, newTime));
    }
  };

  return (
    <Stack>
      <DateInput
        value={value}
        date={date}
        popoverProps={{ opened: false }}
        aria-label={t`Date`}
        onChange={handleDateChange}
        onDateChange={(val) => val && setDate(dayjs(val).toDate())}
      />
      {hasTime && (
        <TimeInput
          value={value}
          aria-label={t`Time`}
          onChange={handleTimeChange}
        />
      )}
      <DatePicker
        value={value}
        date={date}
        onChange={handleDateChange}
        onDateChange={(val) => val && setDate(dayjs(val).toDate())}
      />
    </Stack>
  );
}
