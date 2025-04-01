import {
  Combobox,
  type ComboboxItem,
  OptionsDropdown,
  Pill,
  PillsInput,
  useCombobox,
} from "@mantine/core";

export type MultiAutocompleteProps = {
  values: string[];
  options: ComboboxItem[];
  placeholder?: string;
  onChange: (newValues: string[]) => void;
};

export function MultiAutocomplete({
  values,
  options,
  placeholder,
}: MultiAutocompleteProps) {
  const combobox = useCombobox();

  return (
    <Combobox store={combobox}>
      <Combobox.DropdownTarget>
        <PillsInput>
          <Pill.Group>
            {values.map((value, valueIndex) => (
              <Pill key={valueIndex} withRemoveButton>
                {value}
              </Pill>
            ))}
            <Combobox.EventsTarget>
              <PillsInput.Field placeholder={placeholder} />
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
