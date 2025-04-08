import { t } from "ttag";

import { MultiAutocomplete } from "metabase/ui";

interface StaticValuePickerProps {
  selectedValues: string[];
  placeholder?: string;
  autoFocus?: boolean;
  onCreate?: (rawValue: string) => string | null;
  onChange: (newValues: string[]) => void;
}

export function StaticValuePicker({
  selectedValues,
  placeholder,
  autoFocus,
  onCreate,
  onChange,
}: StaticValuePickerProps) {
  return (
    <MultiAutocomplete
      values={selectedValues}
      options={[]}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      onCreate={onCreate}
      onChange={onChange}
    />
  );
}
