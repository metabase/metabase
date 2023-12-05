import { useMemo } from "react";
import { Select } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { RelativeDatePickerValue } from "../../../types";
import { UNIT_GROUPS } from "../constants";

interface SimpleCurrentDatePickerProps {
  value: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
}

export function SimpleCurrentDatePicker({
  value,
  onChange,
}: SimpleCurrentDatePickerProps) {
  const options = useMemo(
    () =>
      UNIT_GROUPS.flatMap(group =>
        group.map(unit => ({
          value: unit,
          label: Lib.describeTemporalUnit(unit),
        })),
      ),
    [],
  );

  const handleChange = (unitValue: string | null) => {
    const option = options.find(option => option.value === unitValue);
    if (option) {
      onChange({ ...value, unit: option.value });
    }
  };

  return <Select value={value.unit} data={options} onChange={handleChange} />;
}
