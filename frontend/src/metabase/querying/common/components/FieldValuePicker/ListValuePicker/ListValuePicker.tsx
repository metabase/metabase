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
  UnstyledButton,
} from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import S from "./ListValuePicker.module.css";
import { UsStatesMap } from "./UsStatesMap";
import {
  type ContinentPreset,
  getContinentPresets,
  getCountryName,
  getFlagUrl,
} from "./countries";
import { getStateName } from "./states";
import { getEffectiveOptions, searchOptions } from "./utils";

const MAX_TILE_OPTIONS = 8;

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
  const [elevatedValues] = useState(props.selectedValues);
  if (countryValues != null) {
    return <CountryListPicker {...props} fieldValues={countryValues} />;
  }
  if (stateValues != null) {
    return <StateListPicker {...props} fieldValues={stateValues} />;
  }
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
          <span className={S.label} title={option.label}>
            {option.label}
          </span>
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );
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
        leftSection={<Icon name="search" c="text-disabled" />}
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
        <Stack c="text-disabled" justify="center" align="center">
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
  const { fieldValues, selectedValues, onChange } = props;
  const presets = useMemo(
    () => getContinentPresets(fieldValues.map(([value]) => String(value))),
    [fieldValues],
  );

  return (
    <CheckboxListPicker
      {...props}
      header={
        presets.length > 0 && (
          <ContinentPresets
            presets={presets}
            selectedValues={selectedValues}
            onChange={onChange}
          />
        )
      }
      renderLabel={({ value, label }) => (
        <Flex align="center" gap="sm" miw={0}>
          <img className={S.flag} src={getFlagUrl(value)} alt="" />
          <span className={S.label} title={label}>
            {label}
          </span>
        </Flex>
      )}
    />
  );
}

interface ContinentPresetsProps {
  presets: ContinentPreset[];
  selectedValues: string[];
  onChange: (newValues: string[]) => void;
}

function ContinentPresets({
  presets,
  selectedValues,
  onChange,
}: ContinentPresetsProps) {
  const selectedValuesSet = new Set(selectedValues);

  // A preset adds its countries. When all of them are selected, it removes
  // them.
  const handleClick = (preset: ContinentPreset) => {
    const isSelected = preset.values.every((value) =>
      selectedValuesSet.has(value),
    );
    const newValuesSet = new Set(selectedValues);
    preset.values.forEach((value) =>
      isSelected ? newValuesSet.delete(value) : newValuesSet.add(value),
    );
    onChange(Array.from(newValuesSet));
  };

  return (
    <SimpleGrid cols={2} spacing="sm">
      {presets.map((preset) => (
        <UnstyledButton
          key={preset.name}
          className={S.tile}
          aria-pressed={preset.values.every((value) =>
            selectedValuesSet.has(value),
          )}
          onClick={() => handleClick(preset)}
        >
          <span className={S.label}>{preset.name}</span>
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );
}
