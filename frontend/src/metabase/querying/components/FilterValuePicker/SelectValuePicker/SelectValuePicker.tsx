import { MultiSelect } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";
import { getEffectiveOptions } from "../utils";

interface SelectValuePickerProps {
  data: FieldValue[];
  value: string[];
  placeholder?: string;
  getCreateLabel?: (value: string) => string | null;
  onChange: (newValue: string[]) => void;
}

export function SelectValuePicker({
  data,
  value,
  placeholder,
  getCreateLabel,
  onChange,
}: SelectValuePickerProps) {
  const options = getEffectiveOptions(data, value);

  return (
    <MultiSelect
      data={options}
      value={value}
      placeholder={placeholder}
      creatable
      searchable
      onChange={onChange}
      getCreateLabel={getCreateLabel}
      onCreate={query => {
        onChange([...value, query]);
        return query;
      }}
    />
  );
}
