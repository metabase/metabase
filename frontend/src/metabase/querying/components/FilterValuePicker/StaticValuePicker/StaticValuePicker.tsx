import { MultiSelect } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";
import { getMergedOptions, hasDuplicateOptions } from "../utils";

interface StaticValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  shouldCreate: (query: string) => boolean;
  onChange: (newValues: string[]) => void;
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
      shouldCreate={query =>
        !hasDuplicateOptions(options, query) && shouldCreate(query)
      }
      onCreate={query => {
        onChange([...selectedValues, query]);
        return query;
      }}
    />
  );
}
