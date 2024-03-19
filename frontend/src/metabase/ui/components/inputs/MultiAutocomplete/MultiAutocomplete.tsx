import type { MultiSelectProps, SelectItem } from "@mantine/core";
import { MultiSelect } from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import type { FocusEvent } from "react";
import { useMemo, useState } from "react";

export function MultiAutocomplete({
  data,
  value: controlledValue,
  searchValue: controlledSearchValue,
  placeholder,
  autoFocus,
  shouldCreate,
  onChange,
  onSearchChange,
  onFocus,
  onBlur,
  ...props
}: MultiSelectProps) {
  const [selectedValues, setSelectedValues] = useUncontrolled({
    value: controlledValue,
    finalValue: [],
    onChange,
  });
  const [searchValue, setSearchValue] = useUncontrolled({
    value: controlledSearchValue,
    finalValue: "",
    onChange: onSearchChange,
  });
  const [elevatedValues, setElevatedValues] = useState<string[]>([]);
  const [lastSelectedValues, setLastSelectedValues] = useState(selectedValues);
  const [isFocused, setIsFocused] = useState(false);
  const visibleValues = isFocused ? lastSelectedValues : selectedValues;

  const items = useMemo(
    () => getAvailableSelectItems(data, lastSelectedValues, elevatedValues),
    [data, lastSelectedValues, elevatedValues],
  );

  const handleChange = (newValues: string[]) => {
    setSelectedValues(newValues);
    setLastSelectedValues(newValues);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setLastSelectedValues(selectedValues);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    setLastSelectedValues(selectedValues);
    setSearchValue("");
    setElevatedValues([]);
    onBlur?.(event);
  };

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);

    const isValid = shouldCreate?.(newSearchValue, []);
    if (isValid) {
      setSelectedValues([...lastSelectedValues, newSearchValue]);
      setElevatedValues([newSearchValue]);
    } else {
      setSelectedValues(lastSelectedValues);
      setElevatedValues([]);
    }
  };

  return (
    <MultiSelect
      {...props}
      data={items}
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

function getSelectItem(item: string | SelectItem): SelectItem {
  if (typeof item === "string") {
    return { value: item, label: item };
  } else {
    return item;
  }
}

function getAvailableSelectItems(
  data: ReadonlyArray<string | SelectItem>,
  selectedValues: string[],
  elevatedValues: string[],
) {
  const items = [
    ...elevatedValues.map(getSelectItem),
    ...data.map(getSelectItem),
    ...selectedValues.map(getSelectItem),
  ];

  const mapping = items.reduce((map: Map<string, string>, option) => {
    if (option.label) {
      map.set(option.value, option.label);
    } else if (!map.has(option.value)) {
      map.set(option.value, option.value);
    }
    return map;
  }, new Map<string, string>());

  return [...mapping.entries()].map(([value, label]) => ({ value, label }));
}
