import { MultiSelect } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";
import { getMergedOptions } from "../utils";

interface StaticValuePickerProps {
  data: FieldValue[];
  value: string[];
  placeholder?: string;
  shouldCreate?: (query: string) => boolean;
  onChange: (newValue: string[]) => void;
}

export function StaticValuePicker({
  data,
  value,
  placeholder,
  shouldCreate,
  onChange,
}: StaticValuePickerProps) {
  const options = getMergedOptions(data, value);

  return (
    <MultiSelect
      data={options}
      value={value}
      placeholder={placeholder}
      creatable
      searchable
      onChange={onChange}
      shouldCreate={shouldCreate}
      onCreate={query => {
        onChange([...value, query]);
        return query;
      }}
    />
  );
}
