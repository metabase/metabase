import type { MultiSelectProps, SelectItem } from "@mantine/core";
import { MultiSelect, Tooltip } from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import type { ClipboardEvent, FocusEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import { parseValues, unique } from "./utils";

export type MultiAutocompleteProps = Omit<MultiSelectProps, "shouldCreate"> & {
  shouldCreate?: (query: string, selectedValues: string[]) => boolean;
};

export function MultiAutocomplete({
  data,
  value: controlledValue,
  defaultValue,
  searchValue: controlledSearchValue,
  placeholder,
  autoFocus,
  shouldCreate = defaultShouldCreate,
  onChange,
  onSearchChange,
  onFocus,
  onBlur,
  ...props
}: MultiAutocompleteProps) {
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
  const visibleValues = isFocused ? lastSelectedValues : [...selectedValues];

  const items = useMemo(
    () => getAvailableSelectItems(data, lastSelectedValues),
    [data, lastSelectedValues],
  );

  const handleChange = (newValues: string[]) => {
    const values = unique(newValues);
    setSelectedValues(values);
    setLastSelectedValues(values);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setLastSelectedValues(selectedValues);
    onFocus?.(event);
  };

  function isValid(value: string) {
    return value !== "" && shouldCreate?.(value, lastSelectedValues);
  }

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);

    const values = parseValues(searchValue);
    const validValues = values.filter(isValid);

    setSearchValue("");

    if (validValues.length > 0) {
      const newValues = unique([...lastSelectedValues, ...validValues]);
      setSelectedValues(newValues);
      setLastSelectedValues(newValues);
    } else {
      setSelectedValues(lastSelectedValues);
    }

    onBlur?.(event);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();

    const input = event.target as HTMLInputElement;
    const value = input.value;
    const before = value.slice(0, input.selectionStart ?? value.length);
    const after = value.slice(input.selectionEnd ?? value.length);

    const pasted = event.clipboardData.getData("text");
    const text = `${before}${pasted}${after}`;

    const values = parseValues(text);
    const validValues = values.filter(isValid);

    if (values.length > 0) {
      const newValues = unique([...lastSelectedValues, ...validValues]);
      setSelectedValues(newValues);
      setLastSelectedValues(newValues);
      setSearchValue("");
    } else {
      setSearchValue(text);
    }
  };

  const handleSearchChange = (newSearchValue: string) => {
    const first = newSearchValue.at(0);
    const last = newSearchValue.at(-1);

    setSearchValue(newSearchValue);

    if (newSearchValue !== "") {
      const values = parseValues(newSearchValue);
      if (values.length >= 1) {
        const value = values[0] ?? newSearchValue;
        if (isValid(value)) {
          setSelectedValues(unique([...lastSelectedValues, value]));
        }
      }
    }
    if (newSearchValue === "") {
      setSelectedValues(unique([...lastSelectedValues]));
    }

    const quotes = Array.from(newSearchValue).filter(ch => ch === '"').length;

    if (
      (last === "," && quotes % 2 === 0) ||
      last === "\t" ||
      last === "\n" ||
      (first === '"' && last === '"')
    ) {
      const values = parseValues(newSearchValue);
      const validValues = values.filter(isValid);

      if (values.length > 0) {
        setSearchValue("");
      }

      if (validValues.length > 0) {
        const newValues = unique([...lastSelectedValues, ...validValues]);
        setSelectedValues(newValues);
        setLastSelectedValues(newValues);
        setSearchValue("");
      }
    }
  };

  const info = isFocused ? (
    <Tooltip
      label={
        <>
          {t`Separate values with commas, tabs or newlines.`}
          <br />
          {t` Use double quotes for values containing commas.`}
        </>
      }
    >
      <Icon name="info_filled" fill={color("text-light")} />
    </Tooltip>
  ) : (
    <span />
  );

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
      rightSection={info}
    />
  );
}

function getSelectItem(item: string | SelectItem): SelectItem {
  if (typeof item === "string") {
    return { value: item, label: item };
  }

  if (!item.label) {
    return { value: item.value, label: item.value };
  }

  return item;
}

function getAvailableSelectItems(
  data: ReadonlyArray<string | SelectItem>,
  selectedValues: string[],
) {
  const all = [...data, ...selectedValues].map(getSelectItem);
  const seen = new Set();

  // Deduplicate items based on value
  return all.filter(function (option) {
    if (seen.has(option.value)) {
      return false;
    }
    seen.add(option.value);
    return true;
  });
}

function defaultShouldCreate(query: string, selectedValues: string[]) {
  return (
    query.trim().length > 0 && !selectedValues.some(value => value === query)
  );
}
