import type { FocusEvent } from "react";
import { useMemo, useState } from "react";
import { MultiSelect } from "@mantine/core";
import type { MultiSelectProps, SelectItem } from "@mantine/core";

export function MultiAutocomplete({
  value = [],
  data,
  shouldCreate = query => query.length > 0,
  onChange,
  onFocus,
  onBlur,
  onSearchChange,
  ...props
}: MultiSelectProps) {
  const [searchValue, setSearchValue] = useState("");
  const [lastValue, setLastValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const visibleValue = isFocused ? lastValue : value;

  const options = useMemo(() => {
    return getOptions(data);
  }, [data]);

  const visibleOptions = useMemo(() => {
    return getVisibleOptions(visibleValue, options);
  }, [visibleValue, options]);

  const handleChange = (newValue: string[]) => {
    setLastValue(newValue);
    onChange?.(newValue);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setLastValue(value);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    setLastValue(value);
    setSearchValue("");
    onBlur?.(event);
  };

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);

    const isValid = shouldCreate(newSearchValue, visibleOptions);
    const isDuplicate = hasDuplicateOption(newSearchValue, visibleOptions);
    if (isValid && !isDuplicate) {
      onChange?.([...lastValue, newSearchValue]);
    } else {
      onChange?.(lastValue);
    }

    onSearchChange?.(newSearchValue);
  };

  return (
    <MultiSelect
      {...props}
      value={visibleValue}
      data={visibleOptions}
      searchValue={searchValue}
      searchable
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onSearchChange={handleSearchChange}
    />
  );
}

function getOptions(data: ReadonlyArray<string | SelectItem>): SelectItem[] {
  return data.map(item => {
    if (typeof item === "string") {
      return { value: item, label: item };
    } else {
      return item;
    }
  });
}

function getVisibleOptions(value: string[], data: SelectItem[]): SelectItem[] {
  const labelByValue: Record<string, string> = {};

  data.forEach(item => {
    labelByValue[item.value] = item.label ?? item.value;
  });

  value.forEach(item => {
    labelByValue[item] ??= item;
  });

  return Object.entries(labelByValue).map(([value, label]) => ({
    value,
    label,
  }));
}

function hasDuplicateOption(value: string, data: SelectItem[]) {
  return data.some(item => item.value === value);
}
