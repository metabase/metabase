import { useMemo } from "react";
import { Select } from "metabase/ui";
import type { RelativeDatePickerValue } from "../../../types";
import { getUnitOptions } from "./utils";

interface SimpleCurrentDatePickerProps {
  value: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
}

export function SimpleCurrentDatePicker({
  value,
  onChange,
}: SimpleCurrentDatePickerProps) {
  const options = useMemo(() => getUnitOptions(), []);

  const handleChange = (unitValue: string | null) => {
    const option = options.find(option => option.value === unitValue);
    if (option) {
      onChange({ ...value, unit: option.value });
    }
  };

  return <Select value={value.unit} data={options} onChange={handleChange} />;
}
