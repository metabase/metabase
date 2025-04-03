import {
  Combobox,
  type ComboboxItem,
  OptionsDropdown,
  Pill,
  PillsInput,
} from "@mantine/core";
import type { ReactNode } from "react";

import { useMultiAutocomplete } from "./use-multi-autocomplete";

export type MultiAutocompleteProps = {
  values: string[];
  options: ComboboxItem[];
  placeholder?: string;
  shouldCreate?: (value: string) => boolean;
  autoFocus?: boolean;
  nothingFoundMessage?: ReactNode;
  onChange: (newValues: string[]) => void;
  onSearchChange?: (newValue: string) => void;
};

export function MultiAutocomplete({
  values,
  options,
  placeholder,
  shouldCreate,
  autoFocus,
  nothingFoundMessage,
  onChange,
  onSearchChange,
}: MultiAutocompleteProps) {
  const {
    combobox,
    pillValues,
    fieldValue,
    handleFieldChange,
    handleFieldKeyDown,
    handleFieldFocus,
    handleFieldBlur,
    handlePillDoubleClick,
    handlePillRemoveClick,
    handleOptionSubmit,
  } = useMultiAutocomplete({ values, shouldCreate, onChange, onSearchChange });

  return (
    <Combobox store={combobox} onOptionSubmit={handleOptionSubmit}>
      <Combobox.DropdownTarget>
        <PillsInput onClick={() => combobox.openDropdown()}>
          <Pill.Group>
            {pillValues.map((value, valueIndex) =>
              value !== null ? (
                <Pill
                  key={valueIndex}
                  withRemoveButton
                  onDoubleClick={() => handlePillDoubleClick(valueIndex)}
                  onRemove={() => handlePillRemoveClick(valueIndex)}
                >
                  {value}
                </Pill>
              ) : (
                <Combobox.EventsTarget key="field">
                  <PillsInput.Field
                    value={fieldValue}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    onChange={handleFieldChange}
                    onKeyDown={handleFieldKeyDown}
                    onFocus={handleFieldFocus}
                    onBlur={handleFieldBlur}
                  />
                </Combobox.EventsTarget>
              ),
            )}
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>
      <OptionsDropdown
        data={options}
        nothingFoundMessage={nothingFoundMessage}
        filter={undefined}
        search={undefined}
        limit={undefined}
        maxDropdownHeight={undefined}
        unstyled={false}
        labelId={undefined}
        withScrollArea={undefined}
        scrollAreaProps={undefined}
        aria-label={undefined}
      />
    </Combobox>
  );
}
