import {
  type ComboboxItem,
  type TagsInputProps,
  Text,
  Tooltip,
} from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import type { ClipboardEvent, FocusEvent } from "react";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Icon, SpecialTagsInput } from "metabase/ui";

import Styles from "./MultiAutocomplete.module.css";
import { parseValues, unique } from "./utils";

export type MultiAutocompleteProps = Omit<TagsInputProps, "shouldCreate"> & {
  shouldCreate?: (query: string, selectedValues: string[]) => boolean;
  showInfoIcon?: boolean;
  data: ComboboxItem[];
  nothingFoundMessage?: React.ReactNode;
};

export function MultiAutocomplete({
  data,
  value: controlledValue,
  defaultValue,
  searchValue: controlledSearchValue,
  placeholder,
  autoFocus,
  shouldCreate = defaultShouldCreate,
  showInfoIcon = true,
  rightSection,
  onChange,
  onSearchChange,
  onFocus,
  onBlur,
  nothingFoundMessage,
  ...props
}: MultiAutocompleteProps) {
  const [selectedValues, setSelectedValues] = useUncontrolled({
    value: controlledValue,
    defaultValue,
    finalValue: [],
    onChange: val => {
      onChange?.(val);
    },
  });
  const [searchValue, setSearchValue] = useUncontrolled({
    value: controlledSearchValue,
    finalValue: "",
    onChange: onSearchChange,
  });

  const stupidRef = useRef<string[]>([]);
  const [lastSelectedValues, setLastSelectedValues] = useState(selectedValues);
  const [isFocused, setIsFocused] = useState(false);
  // const visibleValues = isFocused ? lastSelectedValues : [...selectedValues];
  const items = useMemo(
    () => getAvailableSelectItems(data, lastSelectedValues),
    [data, lastSelectedValues],
  );

  const handleChange = (newValues: string[]) => {
    const values = unique(newValues)
      .map(parseValues)
      .flat()
      .filter(val => shouldCreate(val, []));
    stupidRef.current = values;
    setLastSelectedValues(values);
    setSelectedValues(values);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    stupidRef.current = selectedValues;
    setLastSelectedValues(selectedValues);
    onFocus?.(event);
  };

  function isValid(value: string) {
    return value !== "" && shouldCreate?.(value, lastSelectedValues);
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();

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
      stupidRef.current = newValues;
      setLastSelectedValues(newValues);
      setSearchValue("");
    } else {
      setSearchValue(text);
    }
  };

  const infoIcon = isFocused ? (
    <Tooltip
      label={
        <Text c="inherit" maw="20rem">
          {t`Separate values with commas, tabs, or newlines. Use double quotes if what you’re searching for has commas — and if it itself includes quotes, use backslashes like this: “searching, you see, is a \\“simple\\” thing.”`}
        </Text>
      }
    >
      <Icon name="info_filled" fill={color("text-light")} />
    </Tooltip>
  ) : null;

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);
    if (newSearchValue !== "") {
      const values = parseValues(newSearchValue);
      if (values.length >= 1) {
        const value = values[0];
        if (shouldCreate(value, [])) {
          setSelectedValues(unique([...stupidRef.current, value]));
        }
      }
    }
    if (newSearchValue === "") {
      setSelectedValues(unique([...stupidRef.current]));
    }
  };

  return (
    <SpecialTagsInput
      {...props}
      classNames={{
        pill: Styles.pill,
        pillsList: Styles.pillList,
        input: Styles.input,
        empty: Styles.empty,
        option: Styles.option,
        options: Styles.optionList,
      }}
      data={items}
      value={lastSelectedValues}
      searchValue={searchValue}
      placeholder={placeholder}
      splitChars={[",", "\t", "\n"]}
      autoFocus={autoFocus}
      onChange={handleChange}
      onFocus={handleFocus}
      onSearchChange={handleSearchChange}
      onPasteCapture={handlePaste}
      onBlur={e => {
        setIsFocused(false);
        onBlur?.(e);
      }}
      rightSection={rightSection ?? (showInfoIcon ? infoIcon : undefined)}
      acceptValueOnBlur
      role="combobox"
      nothingFoundMessage={nothingFoundMessage}
      comboboxProps={{
        withinPortal: false,
        floatingStrategy: "fixed",
        styles: {
          empty: {
            padding: "1.5rem 0.5rem",
            color: "var(--mb-color-text-light)",
          },
        },
        ...props.comboboxProps,
      }}
    />
  );
}

function defaultShouldCreate(query: string) {
  return query.trim().length > 0;
}

function getSelectItem(item: string | ComboboxItem): ComboboxItem {
  if (typeof item === "string") {
    return { value: item, label: item };
  }

  if (!item.label) {
    return { value: item.value, label: item.value?.toString() ?? "" };
  }

  return item;
}

function getAvailableSelectItems(
  data: ReadonlyArray<string | ComboboxItem>,
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
