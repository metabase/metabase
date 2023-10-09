import { useState } from "react";
import { t } from "ttag";
import { Box, Button, DatePicker, Divider, Group } from "metabase/ui";
import type { SpecificDatePickerValue } from "../../types";

interface SingleDatePickerProps {
  value: SpecificDatePickerValue;
  isNew: boolean;
  onChange: (value: SpecificDatePickerValue) => void;
  onSubmit: () => void;
}

export function SingleDatePicker({
  value,
  isNew,
  onChange,
  onSubmit,
}: SingleDatePickerProps) {
  const [date, setDate] = useState<Date | null>(value.values[0]);
  const isValid = date != null;

  const handleChange = (date: Date | null) => {
    setDate(date);
    if (date) {
      onChange({ ...value, values: [date] });
    }
  };
  return (
    <div>
      <Box p="md">
        <DatePicker value={date} onChange={handleChange} />
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
