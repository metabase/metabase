import { useMemo } from "react";
import type { RelativeDatePickerValue } from "metabase/common/components/DatePicker";
import { Select } from "metabase/ui";
import { getUnitOptions } from "./utils";

interface CurrentDatePickerProps {
  value: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
}

export function CurrentDatePicker({ value, onChange }: CurrentDatePickerProps) {
  const options = useMemo(() => getUnitOptions(), []);

  const handleChange = (unitValue: string | null) => {
    const option = options.find(option => option.value === unitValue);
    if (option) {
      onChange({ ...value, unit: option.value });
    }
  };

  return <Select value={value.unit} data={options} onChange={handleChange} />;
}
