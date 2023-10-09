import { useState } from "react";
import { t } from "ttag";
import { Box, Button, DatePicker, Divider, Group } from "metabase/ui";
import type { SpecificDatePickerValue } from "../../types";

interface DateRangePickerProps {
  value: SpecificDatePickerValue;
  isNew: boolean;
  onChange: (value: SpecificDatePickerValue) => void;
  onSubmit: () => void;
}

export function DateRangePicker({
  value,
  isNew,
  onChange,
  onSubmit,
}: DateRangePickerProps) {
  const [startDate, setStartDate] = useState<Date | null>(value.values[0]);
  const [endDate, setEndDate] = useState<Date | null>(value.values[1]);
  const isValid = startDate != null && endDate != null;

  const handleChange = ([startDate, endDate]: [Date | null, Date | null]) => {
    setStartDate(startDate);
    setEndDate(endDate);
    if (startDate != null && endDate != null) {
      onChange({ ...value, values: [startDate, endDate] });
    }
  };

  return (
    <div>
      <Box p="md">
        <DatePicker
          type="range"
          value={[startDate, endDate]}
          onChange={handleChange}
        />
      </Box>
      <Divider />
      <Group p="sm" position="right">
        <Button variant="filled" disabled={!isValid} onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
