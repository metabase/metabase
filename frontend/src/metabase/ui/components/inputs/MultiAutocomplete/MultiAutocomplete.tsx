import type { MultiSelectProps } from "@mantine/core";
import { MultiSelect } from "@mantine/core";
import type { FocusEvent } from "react";
import { useState } from "react";

export function MultiAutocomplete({
  value: selectedValues = [],
  placeholder,
  autoFocus,
  shouldCreate,
  onChange,
  onSearchChange,
  onFocus,
  onBlur,
  ...props
}: MultiSelectProps) {
  const [lastValues, setLastValues] = useState(selectedValues);
  const [isFocused, setIsFocused] = useState(false);
  const visibleValues = isFocused ? lastValues : selectedValues;
  const [searchValue, setSearchValue] = useState("");

  const handleChange = (newValues: string[]) => {
    setLastValues(newValues);
    onChange?.(newValues);
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
    onSearchChange?.(newSearchValue);

    const isValid = shouldCreate?.(newSearchValue, []);
    if (isValid) {
      onChange?.([...lastValues, newSearchValue]);
    } else {
      onChange?.(lastValues);
    }
  };

  return (
    <MultiSelect
      {...props}
      value={visibleValues}
      searchValue={searchValue}
      placeholder={placeholder}
      searchable
      autoFocus={autoFocus}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onSearchChange={handleSearchChange}
    />
  );
}
