import type { ChangeEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { Checkbox, Icon, Stack, Text, TextInput } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import { getEffectiveOptions, searchOptions } from "./utils";

interface ListValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
}

export function ListValuePicker(props: ListValuePickerProps) {
  return <CheckboxListPicker {...props} />;
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
  const availableOptions = getEffectiveOptions(
    fieldValues,
    selectedValues,
    elevatedValues,
  );
  const filteredOptions = searchOptions(availableOptions, searchValue);
  const selectedValuesSet = new Set(selectedValues);
  const selectedFilteredOptions = filteredOptions.filter((option) =>
    selectedValuesSet.has(option.value),
  );
  const isAll = selectedFilteredOptions.length === filteredOptions.length;
  const isNone = selectedFilteredOptions.length === 0;

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.currentTarget.value);
  };

  const handleToggleAll = () => {
    const newSelectedValuesSet = new Set(selectedValues);
    filteredOptions.forEach((option) => {
      if (isAll) {
        newSelectedValuesSet.delete(option.value);
      } else {
        newSelectedValuesSet.add(option.value);
      }
    });
    onChange(Array.from(newSelectedValuesSet));
  };

  return (
    <Stack>
      <TextInput
        value={searchValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
        leftSection={<Icon name="search" c="text-tertiary" />}
        onChange={handleInputChange}
      />
      {filteredOptions.length > 0 ? (
        <Stack>
          <Checkbox
            variant="stacked"
            label={
              <Text c="text-secondary">
                {searchValue ? t`Select these` : t`Select all`}
              </Text>
            }
            checked={isAll}
            indeterminate={!isAll && !isNone}
            onChange={handleToggleAll}
          />
          <Checkbox.Group value={selectedValues} onChange={onChange}>
            <Stack>
              {filteredOptions.map((option) => (
                <Checkbox
                  key={option.value}
                  value={option.value}
                  label={option.label}
                />
              ))}
            </Stack>
          </Checkbox.Group>
        </Stack>
      ) : (
        <Stack c="text-tertiary" justify="center" align="center">
          <Icon name="search" size={40} />
          <Text c="text-secondary" fw="bold">{t`Didn't find anything`}</Text>
        </Stack>
      )}
    </Stack>
  );
}
