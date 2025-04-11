import { t } from "ttag";

import { type ComboboxProps, MultiAutocomplete } from "metabase/ui";

interface StaticValuePickerProps {
  selectedValues: string[];
  placeholder?: string;
  autoFocus?: boolean;
  comboboxProps?: ComboboxProps;
  onCreate?: (rawValue: string) => string | null;
  onChange: (newValues: string[]) => void;
}

export function StaticValuePicker({
  selectedValues,
  placeholder,
  autoFocus,
  comboboxProps,
  onCreate,
  onChange,
}: StaticValuePickerProps) {
  return (
    <MultiAutocomplete
      value={selectedValues}
      placeholder={placeholder}
      autoFocus={autoFocus}
      comboboxProps={comboboxProps}
      aria-label={t`Filter value`}
      onCreate={onCreate}
      onChange={onChange}
    />
  );
}
