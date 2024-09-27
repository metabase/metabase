import { TagsInput, type TagsInputProps, Tooltip } from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import type { ClipboardEvent, FocusEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import { parseValues, unique } from "./utils";

export type MultiAutocompleteProps = Omit<TagsInputProps, "shouldCreate"> & {
  shouldCreate?: (query: string, selectedValues: string[]) => boolean;
  showInfoIcon?: boolean;
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

  const items = data;

  const handleChange = (newValues: string[]) => {
    const values = unique(newValues).map(parseValues).flat().filter(isValid);
    setLastSelectedValues(values);
    setSelectedValues(values);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setLastSelectedValues(selectedValues);
    onFocus?.(event);
  };

  function isValid(value: string) {
    return value !== "" && shouldCreate?.(value, lastSelectedValues);
  }

  // const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
  //   setIsFocused(false);

  //   console.log(event.target.value);

  //   const values = parseValues(event.target.value);
  //   const validValues = values.filter(isValid);

  //   // setSearchValue("");

  //   if (validValues.length > 0) {
  //     const newValues = unique([...lastSelectedValues, ...validValues]);
  //     console.log({ newValues });
  //     setSelectedValues(newValues);
  //     setLastSelectedValues(newValues);
  //   } else {
  //     console.log({ lastSelectedValues });
  //     setSelectedValues(lastSelectedValues);
  //   }

  //   onBlur?.(event);
  // };

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
      setLastSelectedValues(newValues);
      setSearchValue("");
    } else {
      setSearchValue(text);
    }
  };

  const infoIcon = isFocused ? (
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
  ) : null;

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);
    if (newSearchValue !== "") {
      const values = parseValues(newSearchValue);
      if (values.length >= 1) {
        const value = values[0];
        if (isValid(value)) {
          setSelectedValues(unique([...lastSelectedValues, value]));
        }
      }
    }
    if (newSearchValue === "") {
      //TODO: Come up with something better here
      setTimeout(() => {
        setSelectedValues(unique([...lastSelectedValues]));
      }, 200);
    }
  };

  return (
    <TagsInput
      {...props}
      role="combobox"
      data={items}
      value={visibleValues}
      searchValue={searchValue}
      placeholder={placeholder}
      splitChars={[",", "\t", "\n"]}
      autoFocus={autoFocus}
      onChange={handleChange}
      onFocus={handleFocus}
      onSearchChange={handleSearchChange}
      onPasteCapture={handlePaste}
      rightSection={rightSection ?? (showInfoIcon ? infoIcon : null)}
    />
  );
}

function defaultShouldCreate(query: string) {
  return query.trim().length > 0;
}
