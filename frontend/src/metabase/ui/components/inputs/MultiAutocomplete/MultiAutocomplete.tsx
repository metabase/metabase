import {
  Combobox,
  type ComboboxItem,
  OptionsDropdown,
  Pill,
  PillsInput,
  useCombobox,
} from "@mantine/core";
import { type ChangeEvent, useState } from "react";

export type MultiAutocompleteProps = {
  values: string[];
  options: ComboboxItem[];
  placeholder?: string;
  shouldCreate?: (value: string) => boolean;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
};

export function MultiAutocomplete({
  values,
  options,
  placeholder,
  shouldCreate = defaultShouldCreate,
  autoFocus,
  onChange,
}: MultiAutocompleteProps) {
  const combobox = useCombobox();
  const {
    visibleValues,
    fieldValue,
    fieldValueIndex,
    handleFieldChange,
    handleFieldFocus,
    handleFieldBlur,
    handlePillDoubleClick,
    handlePillRemoveClick,
  } = useMultiAutocomplete({ values, shouldCreate, onChange });

  const field = (
    <Combobox.EventsTarget>
      <PillsInput.Field
        value={fieldValue}
        placeholder={placeholder}
        autoFocus={autoFocus || fieldValueIndex != null}
        onChange={handleFieldChange}
        onFocus={handleFieldFocus}
        onBlur={handleFieldBlur}
      />
    </Combobox.EventsTarget>
  );

  return (
    <Combobox store={combobox}>
      <Combobox.DropdownTarget>
        <PillsInput>
          <Pill.Group>
            {visibleValues.map((value, valueIndex) =>
              fieldValueIndex === valueIndex ? (
                field
              ) : (
                <Pill
                  key={valueIndex}
                  withRemoveButton
                  onDoubleClick={() => handlePillDoubleClick(valueIndex)}
                  onRemove={() => handlePillRemoveClick(valueIndex)}
                >
                  {value}
                </Pill>
              ),
            )}
            {fieldValueIndex == null && field}
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>
      <OptionsDropdown
        data={options}
        filter={undefined}
        search={undefined}
        limit={undefined}
        withScrollArea={undefined}
        maxDropdownHeight={undefined}
        unstyled={false}
        labelId={undefined}
        aria-label={undefined}
        scrollAreaProps={undefined}
      />
    </Combobox>
  );
}

type UseMultiAutocompleteProps = {
  values: string[];
  shouldCreate: (newValue: string) => boolean;
  onChange: (newValues: string[]) => void;
};

function useMultiAutocomplete({
  values: effectiveValues,
  shouldCreate,
  onChange,
}: UseMultiAutocompleteProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [pillValues, setPillValues] = useState<string[]>([]);
  const [fieldValue, setFieldValue] = useState("");
  const [fieldValueIndex, setFieldValueIndex] = useState<number>();
  const visibleValues = isFocused ? pillValues : effectiveValues;

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setFieldValue(newValue);

    const isValid = shouldCreate(newValue);
    const newValues = [...pillValues];
    if (fieldValueIndex != null) {
      if (isValid) {
        newValues[fieldValueIndex] = newValue;
      } else {
        newValues.splice(fieldValueIndex, 1);
      }
    } else if (isValid) {
      newValues.push(newValue);
    }
    onChange(newValues);
  };

  const handleFieldFocus = () => {
    setIsFocused(true);
    setPillValues(effectiveValues);
  };

  const handleFieldBlur = () => {
    setIsFocused(false);
    setPillValues([]);
    setFieldValue("");
    setFieldValueIndex(undefined);
  };

  const handlePillDoubleClick = (valueIndex: number) => {
    setFieldValue(visibleValues[valueIndex]);
    setFieldValueIndex(valueIndex);
  };

  const handlePillRemoveClick = (valueIndex: number) => {
    const newValues = [...effectiveValues];
    const removeValueIndex =
      fieldValueIndex != null &&
      valueIndex > fieldValueIndex &&
      !shouldCreate(fieldValue)
        ? valueIndex - 1
        : valueIndex;
    newValues.splice(removeValueIndex, 1);
    onChange(newValues);
    setPillValues(newValues);
    setFieldValue("");
    setFieldValueIndex(undefined);
  };

  return {
    visibleValues,
    fieldValue,
    fieldValueIndex,
    handleFieldChange,
    handleFieldFocus,
    handleFieldBlur,
    handlePillDoubleClick,
    handlePillRemoveClick,
  };
}

function defaultShouldCreate(value: string) {
  return value.trim().length > 0;
}
