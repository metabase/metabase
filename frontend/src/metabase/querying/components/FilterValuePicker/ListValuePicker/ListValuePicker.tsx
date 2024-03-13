import type { ChangeEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import {
  Checkbox,
  MultiSelect,
  Stack,
  Text,
  TextInput,
  Icon,
} from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import { getEffectiveOptions } from "../utils";

import { ColumnGrid } from "./ListValuePicker.styled";
import { LONG_OPTION_LENGTH, MAX_INLINE_OPTIONS } from "./constants";
import { searchOptions } from "./utils";

interface ListValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  onChange: (newValues: string[]) => void;
}

export function ListValuePicker({
  fieldValues,
  selectedValues,
  placeholder,
  autoFocus,
  compact,
  onChange,
}: ListValuePickerProps) {
  if (!compact) {
    return (
      <CheckboxListPicker
        fieldValues={fieldValues}
        selectedValues={selectedValues}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={onChange}
      />
    );
  }

  if (fieldValues.length <= MAX_INLINE_OPTIONS) {
    return (
      <CheckboxGridPicker
        fieldValues={fieldValues}
        selectedValues={selectedValues}
        placeholder={placeholder}
        onChange={onChange}
      />
    );
  }

  return (
    <MultiSelectPicker
      fieldValues={fieldValues}
      selectedValues={selectedValues}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
}

function CheckboxListPicker({
  fieldValues,
  selectedValues,
  placeholder,
  autoFocus,
  onChange,
}: ListValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [elevatedValues] = useState(selectedValues);
  const options = getEffectiveOptions(
    fieldValues,
    selectedValues,
    elevatedValues,
  );
  const visibleOptions = searchOptions(options, searchValue);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.currentTarget.value);
  };

  return (
    <Stack>
      <TextInput
        value={searchValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
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
  const options = getEffectiveOptions(fieldValues, selectedValues);
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

export function MultiSelectPicker({
  fieldValues,
  selectedValues,
  placeholder,
  autoFocus,
  onChange,
}: ListValuePickerProps) {
  const options = getEffectiveOptions(fieldValues, selectedValues);

  return (
    <MultiSelect
      data={options}
      value={selectedValues}
      placeholder={placeholder}
      autoFocus={autoFocus}
      searchable
      aria-label={t`Filter value`}
      onChange={onChange}
    />
  );
}
