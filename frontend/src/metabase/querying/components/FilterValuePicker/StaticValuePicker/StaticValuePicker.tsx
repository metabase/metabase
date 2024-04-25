import type { FocusEvent } from "react";
import { t } from "ttag";

import { MultiAutocomplete } from "metabase/ui";

interface StaticValuePickerProps {
  selectedValues: string[];
  placeholder?: string;
  shouldCreate: (query: string) => boolean;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

export function StaticValuePicker({
  selectedValues,
  placeholder,
  shouldCreate,
  autoFocus,
  onChange,
  onFocus,
  onBlur,
}: StaticValuePickerProps) {
  return (
    <MultiAutocomplete
      data={[]}
      value={selectedValues}
      placeholder={placeholder}
      searchable
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      shouldCreate={shouldCreate}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
