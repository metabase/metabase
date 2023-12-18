import { MultiAutocomplete } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";
import { getFieldOptions } from "../utils";

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
  const options = getFieldOptions(fieldValues);

  return (
    <MultiAutocomplete
      data={options}
      value={selectedValues}
      placeholder={placeholder}
      onChange={onChange}
      shouldCreate={shouldCreate}
    />
  );
}
