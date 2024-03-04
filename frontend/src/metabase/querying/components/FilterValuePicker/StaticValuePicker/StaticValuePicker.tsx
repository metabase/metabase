import type { ChangeEvent, FocusEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { MultiSelect, TextInput } from "metabase/ui";

interface StaticValuePickerProps {
  selectedValues: string[];
  placeholder: string;
  isAutoFocus: boolean;
  isMultiple: boolean;
  isValueValid: (query: string) => boolean;
  onChange: (newValues: string[]) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

export function StaticValuePicker(props: StaticValuePickerProps) {
  return props.isMultiple ? (
    <MultiSelectPicker {...props} />
  ) : (
    <TextInputPicker {...props} />
  );
}

export function TextInputPicker({
  selectedValues,
  placeholder,
  isAutoFocus,
  isValueValid,
  onChange,
  onFocus,
  onBlur,
}: StaticValuePickerProps) {
  const selectedValue = selectedValues[0] ?? "";
  const [inputValue, setInputValue] = useState(selectedValue);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    const isValid = isValueValid(newValue);
    onChange(isValid ? [newValue] : []);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setInputValue(selectedValue);
    onBlur?.(event);
  };

  return (
    <TextInput
      value={inputValue}
      placeholder={placeholder}
      autoFocus={isAutoFocus}
      onChange={handleChange}
      onFocus={onFocus}
      onBlur={handleBlur}
    />
  );
}

export function MultiSelectPicker({
  selectedValues,
  placeholder,
  isAutoFocus,
  isValueValid,
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

    const isValid = isValueValid(newSearchValue);
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
      autoFocus={isAutoFocus}
      aria-label={t`Filter value`}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onSearchChange={handleSearchChange}
    />
  );
}
