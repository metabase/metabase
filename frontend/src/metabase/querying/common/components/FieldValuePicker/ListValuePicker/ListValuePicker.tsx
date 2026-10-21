import type { ChangeEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import {
  Checkbox,
  Icon,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import S from "./ListValuePicker.module.css";
import { getEffectiveOptions, searchOptions } from "./utils";

const MAX_TILE_OPTIONS = 8;

interface ListValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
}

export function ListValuePicker(props: ListValuePickerProps) {
  const [elevatedValues] = useState(props.selectedValues);
  const options = getEffectiveOptions(
    props.fieldValues,
    props.selectedValues,
    elevatedValues,
  );
  return options.length <= MAX_TILE_OPTIONS ? (
    <TileListPicker
      options={options}
      selectedValues={props.selectedValues}
      onChange={props.onChange}
    />
  ) : (
    <CheckboxListPicker {...props} />
  );
}

interface TileListPickerProps {
  options: ReturnType<typeof getEffectiveOptions>;
  selectedValues: string[];
  onChange: (newValues: string[]) => void;
}

function TileListPicker({
  options,
  selectedValues,
  onChange,
}: TileListPickerProps) {
  const selectedValuesSet = new Set(selectedValues);

  const handleToggle = (value: string) => {
    onChange(
      selectedValuesSet.has(value)
        ? selectedValues.filter((selectedValue) => selectedValue !== value)
        : [...selectedValues, value],
    );
  };

  // Prototype: the pt adds to the parent's 12px, so the grid sits 24px below
  // the operator select. The checkbox list uses only the 12px, because its
  // search box belongs with the select.
  return (
    <SimpleGrid cols={2} spacing="sm" pt="md">
      {options.map((option) => (
        <UnstyledButton
          key={option.value}
          className={S.tile}
          aria-pressed={selectedValuesSet.has(option.value)}
          title={option.label}
          onClick={() => handleToggle(option.value)}
        >
          <span className={S.label}>{option.label}</span>
        </UnstyledButton>
      ))}
    </SimpleGrid>
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
    <Stack gap="xl">
      <TextInput
        value={searchValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
        leftSection={<Icon name="search" c="text-disabled" />}
        onChange={handleInputChange}
      />
      {filteredOptions.length > 0 ? (
        <Stack mah="30vh" style={{ overflowY: "auto" }}>
          <Checkbox
            variant="stacked"
            label={
              <Text c="text-secondary" lh="inherit">
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
        <Stack c="text-disabled" justify="center" align="center">
          <Icon name="search" size={40} />
          <Text c="text-secondary" fw="bold">{t`Didn't find anything`}</Text>
        </Stack>
      )}
    </Stack>
  );
}
