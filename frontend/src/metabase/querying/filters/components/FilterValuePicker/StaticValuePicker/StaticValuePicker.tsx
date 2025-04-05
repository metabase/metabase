import { t } from "ttag";

import { MultiAutocomplete } from "metabase/ui";

interface StaticValuePickerProps {
  selectedValues: string[];
  placeholder?: string;
  shouldCreate?: (query: string) => boolean;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
}

export function StaticValuePicker({
  selectedValues,
  placeholder,
  shouldCreate,
  autoFocus,
  onChange,
}: StaticValuePickerProps) {
  return (
    <MultiAutocomplete
      values={selectedValues}
      options={[]}
      placeholder={placeholder}
      shouldCreate={shouldCreate}
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      onChange={onChange}
    />
  );
}
