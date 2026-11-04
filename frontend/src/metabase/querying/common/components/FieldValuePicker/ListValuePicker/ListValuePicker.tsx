import type { ChangeEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Checkbox,
  Flex,
  Icon,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import S from "./ListValuePicker.module.css";
import { UsStatesMap } from "./UsStatesMap";
import { getCountryName } from "./countries";
import { getStateName } from "./states";
import { getEffectiveOptions, searchOptions } from "./utils";

interface ListValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  autoFocus?: boolean;
  /** Prototype: the column has the Country semantic type. */
  isCountry?: boolean;
  /** Prototype: the column has the State semantic type. */
  isState?: boolean;
  onChange: (newValues: string[]) => void;
}

export function ListValuePicker({
  isCountry,
  isState,
  ...props
}: ListValuePickerProps) {
  const countryValues = useMemo(
    () =>
      isCountry ? getNamedFieldValues(props.fieldValues, getCountryName) : null,
    [isCountry, props.fieldValues],
  );
  const stateValues = useMemo(
    () =>
      isState ? getNamedFieldValues(props.fieldValues, getStateName) : null,
    [isState, props.fieldValues],
  );
  if (countryValues != null) {
    return <CountryListPicker {...props} fieldValues={countryValues} />;
  }
  if (stateValues != null) {
    return <StateListPicker {...props} fieldValues={stateValues} />;
  }
  return <CheckboxListPicker {...props} />;
}

interface CheckboxListPickerProps extends ListValuePickerProps {
  /** Content between the search box and the list. */
  header?: ReactNode;
  columns?: number;
  renderLabel?: (option: { value: string; label: string }) => ReactNode;
}

function CheckboxListPicker({
  fieldValues,
  selectedValues,
  placeholder,
  autoFocus,
  header,
  columns = 1,
  renderLabel,
  onChange,
}: CheckboxListPickerProps) {
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
        leftSection={<Icon name="search" c="text-secondary" />}
        onChange={handleInputChange}
      />
      {header}
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
            <SimpleGrid cols={columns} spacing="sm" verticalSpacing="md">
              {filteredOptions.map((option) => (
                <Checkbox
                  key={option.value}
                  value={option.value}
                  classNames={{
                    root: S.checkboxRoot,
                    body: S.checkboxBody,
                    labelWrapper: S.checkboxLabelWrapper,
                    label: S.checkboxLabel,
                  }}
                  label={
                    renderLabel ? (
                      renderLabel({ value: option.value, label: option.label })
                    ) : (
                      <span className={S.label} title={option.label}>
                        {option.label}
                      </span>
                    )
                  }
                />
              ))}
            </SimpleGrid>
          </Checkbox.Group>
        </Stack>
      ) : (
        <Stack c="text-secondary" justify="center" align="center">
          <Icon name="search" size={40} />
          <Text c="text-secondary" fw="bold">{t`Didn't find anything`}</Text>
        </Stack>
      )}
    </Stack>
  );
}

/**
 * Prototype: field values with names as labels, sorted by name, when all the
 * values have a name. Otherwise null.
 */
function getNamedFieldValues(
  fieldValues: FieldValue[],
  getName: (value: string) => string | null,
): FieldValue[] | null {
  const namedValues: FieldValue[] = [];
  for (const [value] of fieldValues) {
    // The list does not show empty values.
    if (value == null) {
      continue;
    }
    const name = typeof value === "string" ? getName(value) : null;
    if (name == null) {
      return null;
    }
    namedValues.push([value, name]);
  }
  return namedValues.sort(([, a], [, b]) => String(a).localeCompare(String(b)));
}

function StateListPicker(props: ListValuePickerProps) {
  const { fieldValues, selectedValues, onChange } = props;
  const valuesByCode = useMemo(
    () =>
      new Map(
        fieldValues.map(([value]) => [
          String(value).toUpperCase(),
          String(value),
        ]),
      ),
    [fieldValues],
  );

  const handleToggle = (value: string) => {
    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter((selectedValue) => selectedValue !== value)
        : [...selectedValues, value],
    );
  };

  return (
    <CheckboxListPicker
      {...props}
      columns={2}
      header={
        <UsStatesMap
          valuesByCode={valuesByCode}
          selectedValues={selectedValues}
          onToggle={handleToggle}
        />
      }
      renderLabel={({ value, label }) => (
        <Flex gap="xs" miw={0}>
          <span className={S.label} title={label}>
            {label}
          </span>
          <Text component="span" c="text-secondary" lh="inherit" flex="none">
            {value.toUpperCase()}
          </Text>
        </Flex>
      )}
    />
  );
}

function CountryListPicker(props: ListValuePickerProps) {
  return <CheckboxListPicker {...props} />;
}
