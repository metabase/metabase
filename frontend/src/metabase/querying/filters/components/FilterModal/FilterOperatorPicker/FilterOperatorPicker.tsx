import { useMemo } from "react";

import { Select } from "metabase/ui";

type Option<T> = {
  name: string;
  operator: T;
};

interface FilterOperatorPickerProps<T> {
  value: T;
  options: Option<T>[];
  disabled?: boolean;
  onChange: (operator: T) => void;
}

export function FilterOperatorPicker<T extends string>({
  value,
  options,
  disabled,
  onChange,
}: FilterOperatorPickerProps<T>) {
  const selectOptions = useMemo(() => {
    return options.map(option => ({
      label: option.name,
      value: option.operator,
    }));
  }, [options]);

  return (
    <Select
      data={selectOptions}
      disabled={disabled}
      value={value}
      onChange={onChange}
    />
  );
}
