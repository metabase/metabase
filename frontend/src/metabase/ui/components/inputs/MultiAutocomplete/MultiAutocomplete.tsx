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
  values: effectiveValues,
  options,
  placeholder,
  shouldCreate = defaultShouldCreate,
  autoFocus,
  onChange,
}: MultiAutocompleteProps) {
  const combobox = useCombobox();
  const [isFocused, setIsFocused] = useState(false);
  const [pillValues, setPillValues] = useState<string[]>([]);
  const [fieldValue, setFieldValue] = useState("");
  const [editValueIndex, setEditValueIndex] = useState<number>();
  const visibleValues = isFocused ? pillValues : effectiveValues;

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setFieldValue(newValue);

    const isValid = shouldCreate(newValue);
    const newValues = [...pillValues];
    if (editValueIndex != null) {
      if (isValid) {
        newValues[editValueIndex] = newValue;
      } else {
        newValues.splice(editValueIndex, 1);
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
    setEditValueIndex(undefined);
  };

  const handlePillDoubleClick = (valueIndex: number) => {
    setFieldValue(visibleValues[valueIndex]);
    setEditValueIndex(valueIndex);
  };

  const handlePillRemove = (valueIndex: number) => {
    const newValues = [...effectiveValues];
    const removeValueIndex =
      editValueIndex != null &&
      valueIndex > editValueIndex &&
      !shouldCreate(fieldValue)
        ? valueIndex - 1
        : valueIndex;
    newValues.splice(removeValueIndex, 1);
    onChange(newValues);
    setPillValues(newValues);
    setFieldValue("");
    setEditValueIndex(undefined);
  };

  const field = (
    <Combobox.EventsTarget>
      <PillsInput.Field
        value={fieldValue}
        placeholder={placeholder}
        autoFocus={autoFocus || editValueIndex != null}
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
              editValueIndex === valueIndex ? (
                field
              ) : (
                <Pill
                  key={valueIndex}
                  withRemoveButton
                  onDoubleClick={() => handlePillDoubleClick(valueIndex)}
                  onRemove={() => handlePillRemove(valueIndex)}
                >
                  {value}
                </Pill>
              ),
            )}
            {editValueIndex == null && field}
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

function defaultShouldCreate(value: string) {
  return value.trim().length > 0;
}
