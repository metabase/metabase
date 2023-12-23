import { useState } from "react";
import type { FocusEvent } from "react";
import { t } from "ttag";
import { MultiSelect } from "metabase/ui";

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
  const [lastValues, setLastValues] = useState(selectedValues);
  const [isFocused, setIsFocused] = useState(false);
  const visibleValues = isFocused ? lastValues : selectedValues;
  const [searchValue, setSearchValue] = useState("");

  const handleChange = (newValues: string[]) => {
    setLastValues(newValues);
    onChange(newValues);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setLastValues(selectedValues);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    setLastValues(selectedValues);
    setSearchValue("");
    onBlur?.(event);
  };

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);

    const isValid = shouldCreate(newSearchValue);
    if (isValid) {
      onChange?.([...lastValues, newSearchValue]);
    } else {
      onChange?.(lastValues);
    }
  };

  return (
    <MultiSelect
      data={visibleValues}
      value={visibleValues}
      searchValue={searchValue}
      placeholder={placeholder}
      searchable
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onSearchChange={handleSearchChange}
    />
  );
}
