import { useState } from "react";
import type { KeyboardEvent, ChangeEvent } from "react";
import { t } from "ttag";
import { Checkbox, Stack, Text, TextInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { FieldValue } from "metabase-types/api";
import { getMergedOptions, hasDuplicateOption } from "../utils";
import { LONG_OPTION_LENGTH } from "./constants";
import { searchOptions } from "./utils";
import { ColumnGrid } from "./ListValuePicker.styled";

interface ListValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  shouldCreate: (query: string) => boolean;
  autoFocus?: boolean;
  compact?: boolean;
  onChange: (newValues: string[]) => void;
}

export function ListValuePicker({
  fieldValues,
  selectedValues,
  placeholder,
  shouldCreate,
  autoFocus,
  compact,
  onChange,
}: ListValuePickerProps) {
  return compact ? (
    <CompactValuePicker
      fieldValues={fieldValues}
      selectedValues={selectedValues}
      placeholder={placeholder}
      shouldCreate={shouldCreate}
      onChange={onChange}
    />
  ) : (
    <DefaultValuePicker
      fieldValues={fieldValues}
      selectedValues={selectedValues}
      placeholder={placeholder}
      shouldCreate={shouldCreate}
      autoFocus={autoFocus}
      onChange={onChange}
    />
  );
}

function DefaultValuePicker({
  fieldValues,
  selectedValues,
  placeholder,
  shouldCreate,
  autoFocus,
  onChange,
}: ListValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const options = getMergedOptions(fieldValues, selectedValues);
  const visibleOptions = searchOptions(options, searchValue);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.currentTarget.value);
  };

  const handleInputKeydown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      const isValid = shouldCreate(searchValue);
      const isDuplicate = hasDuplicateOption(options, searchValue);
      if (isValid && !isDuplicate) {
        event.preventDefault();
        onChange([...selectedValues, searchValue]);
      }
    }
  };

  return (
    <Stack>
      <TextInput
        value={searchValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={handleInputChange}
        onKeyDown={handleInputKeydown}
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
          <Stack c="text.0" justify="center" align="center">
            <Icon name="search" size={40} />
            <Text c="text.1" fw="bold">{t`Didn't find anything`}</Text>
          </Stack>
        )}
      </Checkbox.Group>
    </Stack>
  );
}

function CompactValuePicker({
  fieldValues,
  selectedValues,
  onChange,
}: ListValuePickerProps) {
  const options = getMergedOptions(fieldValues, selectedValues);
  const hasLongOptions = options.some(
    option => option.label.length > LONG_OPTION_LENGTH,
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
