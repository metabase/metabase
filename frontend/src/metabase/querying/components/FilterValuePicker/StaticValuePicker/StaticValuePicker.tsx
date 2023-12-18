import { useMemo } from "react";
import type { FocusEvent } from "react";
import { MultiAutocomplete } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";
import { getFieldOptions } from "../utils";

interface StaticValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  shouldCreate: (query: string) => boolean;
  onChange: (newValues: string[]) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

export function StaticValuePicker({
  fieldValues,
  selectedValues,
  placeholder,
  shouldCreate,
  onChange,
  onFocus,
  onBlur,
}: StaticValuePickerProps) {
  const options = useMemo(() => getFieldOptions(fieldValues), [fieldValues]);

  return (
    <MultiAutocomplete
      data={options}
      value={selectedValues}
      placeholder={placeholder}
      shouldCreate={shouldCreate}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
