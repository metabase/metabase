import type { MultiSelectProps, SelectItem } from "@mantine/core";
import { MultiSelect } from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import type { ClipboardEvent, FocusEvent } from "react";
import { useMemo, useState } from "react";

export function MultiAutocomplete({
  data,
  value: controlledValue,
  defaultValue,
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
    defaultValue,
    finalValue: [],
    onChange,
  });
  const [searchValue, setSearchValue] = useUncontrolled({
    value: controlledSearchValue,
    finalValue: "",
    onChange: onSearchChange,
  });
  const [lastSelectedValues, setLastSelectedValues] = useState(selectedValues);
  const [isFocused, setIsFocused] = useState(false);
  const visibleValues = isFocused ? lastSelectedValues : selectedValues;

  const items = useMemo(
    () => getAvailableSelectItems(data, lastSelectedValues),
    [data, lastSelectedValues],
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
    onBlur?.(event);
  };

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);

    const isValid = shouldCreate?.(newSearchValue, []);
    if (isValid) {
      setSelectedValues([...lastSelectedValues, newSearchValue]);
    } else {
      setSelectedValues(lastSelectedValues);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("Text");
    const values = text.split(/[\n,]/g);
    if (values.length > 1) {
      const validValues = [...new Set(values)]
        .map(value => value.trim())
        .filter(value => shouldCreate?.(value, []));
      if (validValues.length > 0) {
        event.preventDefault();
        const newSelectedValues = [...lastSelectedValues, ...validValues];
        setSelectedValues(newSelectedValues);
        setLastSelectedValues(newSelectedValues);
      }
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
      onPaste={handlePaste}
    />
  );
}

function getSelectItem(item: string | SelectItem): SelectItem {
  if (typeof item === "string") {
    return { value: item };
  } else {
    return item;
  }
}

function getAvailableSelectItems(
  data: ReadonlyArray<string | SelectItem>,
  selectedValues: string[],
) {
  const items = [
    ...data.map(getSelectItem),
    ...selectedValues.map(getSelectItem),
  ];

  const mapping = items.reduce((map: Map<string, string>, option) => {
    if (!map.has(option.value)) {
      map.set(option.value, option.label ?? option.value);
    }
    return map;
  }, new Map<string, string>());

  return [...mapping.entries()].map(([value, label]) => ({ value, label }));
}
