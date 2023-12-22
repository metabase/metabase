import { useMemo } from "react";
import { t } from "ttag";
import { Select } from "metabase/ui";
import { checkNotNull } from "metabase/lib/types";

type Option<T> = {
  name: string;
  operator: T;
};

interface FilterOperatorPickerProps<T> {
  value: T;
  options: Option<T>[];
  onChange: (operator: T) => void;
}

export function FilterOperatorPicker<T extends string>({
  value,
  options,
  onChange,
}: FilterOperatorPickerProps<T>) {
  const data = useMemo(
    () =>
      options.map(option => ({ label: option.name, value: option.operator })),
    [options],
  );

  const handleChange = (value: string | null) => {
    const option = checkNotNull(
      options.find(option => option.operator === value),
    );
    onChange(option.operator);
  };

  return (
    <Select
      data={data}
      value={value}
      aria-label={t`Filter operator`}
      onChange={handleChange}
    />
  );
}
