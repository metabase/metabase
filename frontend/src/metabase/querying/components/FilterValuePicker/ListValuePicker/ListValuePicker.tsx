import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Checkbox,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  Icon,
} from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import { getAvailableOptions, getOptionsWithSearchInput } from "../utils";

import { ColumnGrid } from "./ListValuePicker.styled";
import { LONG_OPTION_LENGTH, MAX_INLINE_OPTIONS } from "./constants";
import { searchOptions } from "./utils";

interface ListValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder: string;
  isAutoFocus: boolean;
  isCompact: boolean;
  isMultiple: boolean;
  isValueValid: (query: string) => boolean;
  onChange: (newValues: string[]) => void;
}

export function ListValuePicker(props: ListValuePickerProps) {
  if (!props.isMultiple) {
    return <SingleSelectPicker {...props} />;
  }

  if (!props.isCompact) {
    return <CheckboxListPicker {...props} />;
  }

  if (props.fieldValues.length <= MAX_INLINE_OPTIONS) {
    return <CheckboxGridPicker {...props} />;
  }

  return <MultiSelectPicker {...props} />;
}

function CheckboxListPicker({
  fieldValues,
  selectedValues,
  placeholder,
  isAutoFocus,
  onChange,
}: ListValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const options = getAvailableOptions(fieldValues, selectedValues);
  const visibleOptions = searchOptions(options, searchValue);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.currentTarget.value);
  };

  return (
    <Stack>
      <TextInput
        value={searchValue}
        placeholder={placeholder}
        autoFocus={isAutoFocus}
        onChange={handleInputChange}
      />
      <Checkbox.Group value={selectedValues} onChange={onChange}>
        {visibleOptions.length > 0 ? (
          <Stack>
            {visibleOptions.map(option => (
              <Checkbox
                key={option.value}
                value={option.value}
                label={option.label}
              />
            ))}
          </Stack>
        ) : (
          <Stack c="text-light" justify="center" align="center">
            <Icon name="search" size={40} />
            <Text c="text-medium" fw="bold">{t`Didn't find anything`}</Text>
          </Stack>
        )}
      </Checkbox.Group>
    </Stack>
  );
}

function CheckboxGridPicker({
  fieldValues,
  selectedValues,
  onChange,
}: ListValuePickerProps) {
  const options = getAvailableOptions(fieldValues, selectedValues);
  const hasLongOptions = options.some(
    ({ label }) => label != null && label.length > LONG_OPTION_LENGTH,
  );
  const cols = hasLongOptions ? 1 : 2;
  const rows = Math.ceil(options.length / cols);

  return (
    <Checkbox.Group value={selectedValues} onChange={onChange}>
      <ColumnGrid rows={rows}>
        {options.map(option => (
          <Checkbox
            key={option.value}
            value={option.value}
            label={option.label}
          />
        ))}
      </ColumnGrid>
    </Checkbox.Group>
  );
}

export function SingleSelectPicker({
  fieldValues,
  selectedValues,
  placeholder,
  isAutoFocus,
  isValueValid,
  onChange,
}: ListValuePickerProps) {
  const options = useMemo(
    () => getAvailableOptions(fieldValues, selectedValues),
    [fieldValues, selectedValues],
  );

  const [searchValue, setSearchValue] = useState("");

  const handleChange = (value: string | null) => {
    onChange(value != null ? [value] : []);
  };

  return (
    <Select
      data={getOptionsWithSearchInput(options, searchValue, isValueValid)}
      value={selectedValues[0]}
      searchValue={searchValue}
      placeholder={placeholder}
      autoFocus={isAutoFocus}
      searchable
      aria-label={t`Filter value`}
      onChange={handleChange}
      onSearchChange={setSearchValue}
    />
  );
}

export function MultiSelectPicker({
  fieldValues,
  selectedValues,
  placeholder,
  isAutoFocus,
  onChange,
}: ListValuePickerProps) {
  const options = getAvailableOptions(fieldValues, selectedValues);

  return (
    <MultiSelect
      data={options}
      value={selectedValues}
      placeholder={placeholder}
      autoFocus={isAutoFocus}
      aria-label={t`Filter value`}
      onChange={onChange}
    />
  );
}
