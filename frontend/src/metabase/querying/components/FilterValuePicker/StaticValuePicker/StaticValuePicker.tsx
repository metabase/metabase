import type { FocusEvent } from "react";
import { t } from "ttag";
import { MultiSelect } from "metabase/ui";
import { getSelectedItems } from "../utils";

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
  const items = getSelectedItems(selectedValues);

  return (
    <MultiSelect
      data={items}
      value={selectedValues}
      placeholder={placeholder}
      shouldCreate={shouldCreate}
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
