import { useState } from "react";
import { t } from "ttag";
import { DateInput, DatePicker, Stack, TimeInput } from "metabase/ui";
import type { DateValue } from "metabase/ui";
import { setDatePart, setTimePart } from "../../utils";

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

  const handleDateChange = (newDate: DateValue) => {
    newDate && onChange(setDatePart(value, newDate));
  };

  const handleTimeChange = (newTime: Date) => {
    onChange(setTimePart(value, newTime));
  };

  return (
    <Stack>
      <DateInput
        value={value}
        date={date}
        popoverProps={{ opened: false }}
        aria-label={t`Date`}
        onChange={handleDateChange}
        onDateChange={setDate}
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
        onDateChange={setDate}
      />
    </Stack>
  );
}
