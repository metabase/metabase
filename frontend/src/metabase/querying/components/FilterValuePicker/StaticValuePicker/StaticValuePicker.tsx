import { MultiSelect } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";
import { getMergedOptions } from "../utils";

interface StaticValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  shouldCreate?: (query: string) => boolean;
  onChange: (newValue: string[]) => void;
}

export function StaticValuePicker({
  fieldValues,
  selectedValues,
  placeholder,
  shouldCreate,
  onChange,
}: StaticValuePickerProps) {
  const options = getMergedOptions(fieldValues, selectedValues);

  return (
    <MultiSelect
      data={options}
      value={selectedValues}
      placeholder={placeholder}
      creatable
      searchable
      onChange={onChange}
      shouldCreate={shouldCreate}
      onCreate={query => {
        onChange([...selectedValues, query]);
        return query;
      }}
    />
  );
}
