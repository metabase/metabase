import { useMemo, useState } from "react";
import { Select } from "metabase/ui";
import { BackButton } from "../BackButton";
import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../types";
import { DEFAULT_VALUE } from "./constants";
import { getUnitOptions } from "./utils";

interface RelativeDatePickerProps {
  value?: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
  onBack: () => void;
}

export function RelativeDatePicker({
  value: initialValue = DEFAULT_VALUE,
  onChange,
  onBack,
}: RelativeDatePickerProps) {
  const [value, setValue] = useState(initialValue);

  const handleUnitChange = (unit: DatePickerTruncationUnit) => {
    setValue({ ...value, unit });
  };

  return (
    <div>
      <BackButton onClick={onBack} />
      <UnitSelect unit={value.unit} onChange={handleUnitChange} />
    </div>
  );
}

interface UnitSelectProps {
  unit: DatePickerTruncationUnit;
  onChange: (unit: DatePickerTruncationUnit) => void;
}

function UnitSelect({ unit, onChange }: UnitSelectProps) {
  const options = useMemo(() => {
    return getUnitOptions();
  }, []);

  const handleChange = (value: string | null) => {
    const option = options.find(option => option.value === value);
    if (option) {
      onChange(option.value);
    }
  };

  return (
    <Select
      data={options}
      value={unit}
      withinPortal={false}
      onChange={handleChange}
    />
  );
}
