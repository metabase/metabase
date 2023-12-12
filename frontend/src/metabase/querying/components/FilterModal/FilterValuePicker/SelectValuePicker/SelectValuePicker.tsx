import { MultiSelect } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";
import { getFieldOptions, getStaticOptions } from "../utils";

interface SelectValuePickerProps {
  data: FieldValue[];
  value: string[];
  placeholder: string;
  getCreateLabel: (value: string) => string | null;
  onChange: (newValue: string[]) => void;
}

export function SelectValuePicker({
  data,
  value,
  placeholder,
  getCreateLabel,
  onChange,
}: SelectValuePickerProps) {
  const options =
    data.length > 0 ? getFieldOptions(data) : getStaticOptions(value);

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
