import { t } from "ttag";

import { MultiAutocompleteWithTranslation } from "metabase/common/components/MultiAutocomplete";
import type { ComboboxProps } from "metabase/ui";

interface StaticValuePickerProps {
  selectedValues: string[];
  placeholder?: string;
  autoFocus?: boolean;
  comboboxProps?: ComboboxProps;
  parseValue?: (rawValue: string) => string | null;
  onChange: (newValues: string[]) => void;
}

export function StaticValuePicker({
  selectedValues,
  placeholder,
  autoFocus,
  comboboxProps,
  parseValue,
  onChange,
}: StaticValuePickerProps) {
  return (
    <MultiAutocompleteWithTranslation
      value={selectedValues}
      placeholder={placeholder}
      autoFocus={autoFocus}
      comboboxProps={comboboxProps}
      aria-label={t`Filter value`}
      parseValue={parseValue}
      onChange={onChange}
    />
  );
}
