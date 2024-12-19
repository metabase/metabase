import type { CSSProperties, ChangeEvent, FocusEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Checkbox,
  Icon,
  MultiAutocomplete,
  Stack,
  Text,
  TextInput,
  useMantineTheme,
} from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import { getEffectiveOptions, getFieldOptions } from "../utils";

import S from "./ListValuePicker.module.css";
import { LONG_OPTION_LENGTH, MAX_INLINE_OPTIONS } from "./constants";
import { searchOptions } from "./utils";

interface ListValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  shouldCreate?: (query: string, values: string[]) => boolean;
  autoFocus?: boolean;
  compact?: boolean;
  onChange: (newValues: string[]) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

export function ListValuePicker(props: ListValuePickerProps) {
  if (!props.compact) {
    return <CheckboxListPicker {...props} />;
  }

  if (props.fieldValues.length <= MAX_INLINE_OPTIONS) {
    return <CheckboxGridPicker {...props} />;
  }

  return <AutocompletePicker {...props} />;
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
  const selectedFilteredOptions = filteredOptions.filter(option =>
    selectedValuesSet.has(option.value),
  );
  const isAll = selectedFilteredOptions.length === filteredOptions.length;
  const isNone = selectedFilteredOptions.length === 0;

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.currentTarget.value);
  };

  const handleToggleAll = () => {
    const newSelectedValuesSet = new Set(selectedValues);
    filteredOptions.forEach(option => {
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
        icon={<Icon name="search" c="text-light" />}
        onChange={handleInputChange}
      />
      {filteredOptions.length > 0 ? (
        <Stack>
          <Checkbox
            variant="stacked"
            label={getToggleAllLabel(searchValue, isAll)}
            checked={isAll}
            indeterminate={!isAll && !isNone}
            onChange={handleToggleAll}
          />
          <Checkbox.Group value={selectedValues} onChange={onChange}>
            <Stack>
              {filteredOptions.map(option => (
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
        <Stack c="text-light" justify="center" align="center">
          <Icon name="search" size={40} />
          <Text c="text-medium" fw="bold">{t`Didn't find anything`}</Text>
        </Stack>
      )}
    </Stack>
  );
}

function getToggleAllLabel(searchValue: string, isAll: boolean) {
  if (isAll) {
    return t`Select none`;
  } else {
    return searchValue ? t`Select these` : t`Select all`;
  }
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
  const theme = useMantineTheme();

  return (
    <Checkbox.Group value={selectedValues} onChange={onChange}>
      <div
        className={S.ColumnGrid}
        style={
          {
            "--column-grid-rows": rows,
            "--column-grid-gap": theme.spacing.md,
          } as CSSProperties
        }
      >
        {options.map(option => (
          <Checkbox
            key={option.value}
            value={option.value}
            label={option.label}
          />
        ))}
      </div>
    </Checkbox.Group>
  );
}

export function AutocompletePicker({
  fieldValues,
  selectedValues,
  placeholder,
  shouldCreate,
  autoFocus,
  onChange,
  onFocus,
  onBlur,
}: ListValuePickerProps) {
  const options = useMemo(() => getFieldOptions(fieldValues), [fieldValues]);

  return (
    <MultiAutocomplete
      data={options}
      value={selectedValues}
      placeholder={placeholder}
      shouldCreate={shouldCreate}
      autoFocus={autoFocus}
      searchable
      aria-label={t`Filter value`}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
