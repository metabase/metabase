import { useState } from "react";
import { t } from "ttag";
import {
  Button,
  DateInput,
  DatePicker,
  Divider,
  Group,
  Stack,
  Text,
} from "metabase/ui";
import type { DateValue, DatesRangeValue } from "metabase/ui";

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
  const [startDate, setStartDate] = useState<DateValue>(initialStartDate);
  const [endDate, setEndDate] = useState<DateValue>(initialEndDate);
  const isValid = startDate != null && endDate != null;

  const handleRangeChange = ([newStartDate, newEndDate]: DatesRangeValue) => {
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    if (newStartDate != null && newEndDate != null) {
      onChange([newStartDate, newEndDate]);
    }
  };

  const handleStartDateChange = (newStartDate: DateValue) => {
    handleRangeChange([newStartDate, endDate]);
  };

  const handleEndDateChange = (newEndDate: DateValue) => {
    handleRangeChange([startDate, newEndDate]);
  };

  return (
    <div>
      <Stack p="md" align="center">
        <Group align="center">
          <DateInput
            value={startDate}
            popoverProps={{ opened: false }}
            onChange={handleStartDateChange}
          />
          <Text>{t`and`}</Text>
          <DateInput
            value={endDate}
            popoverProps={{ opened: false }}
            onChange={handleEndDateChange}
          />
        </Group>
        <DatePicker
          type="range"
          value={[startDate, endDate]}
          defaultDate={initialEndDate}
          allowSingleDateInRange
          onChange={handleRangeChange}
        />
      </Stack>
      <Divider />
      <Group p="sm" position="right">
        <Button variant="filled" disabled={!isValid} onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
