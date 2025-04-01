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
  onChange: (newValues: string[]) => void;
};

export function MultiAutocomplete({
  values: effectiveValues,
  options,
  placeholder,
  onChange,
}: MultiAutocompleteProps) {
  const combobox = useCombobox();
  const [isFocused, setIsFocused] = useState(false);
  const [focusedValues, setFocusedValues] = useState<string[]>([]);
  const visibleValues = isFocused ? focusedValues : effectiveValues;

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    const newValues = [...focusedValues, newValue];
    onChange(newValues);
  };

  const handleFieldFocus = () => {
    setIsFocused(true);
    setFocusedValues(effectiveValues);
  };

  const handleFieldBlur = () => {
    setIsFocused(false);
    setFocusedValues([]);
  };

  const handlePillDoubleClick = (valueIndex: number) => {
    setEditValueIndex(valueIndex);
  };

  return (
    <Combobox store={combobox}>
      <Combobox.DropdownTarget>
        <PillsInput>
          <Pill.Group>
            {visibleValues.map((value, valueIndex) => (
              <Pill
                key={valueIndex}
                withRemoveButton
                onDoubleClick={() => handlePillDoubleClick(valueIndex)}
              >
                {value}
              </Pill>
            ))}
            <Combobox.EventsTarget>
              <PillsInput.Field
                placeholder={placeholder}
                onChange={handleFieldChange}
                onFocus={handleFieldFocus}
                onBlur={handleFieldBlur}
              />
            </Combobox.EventsTarget>
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
