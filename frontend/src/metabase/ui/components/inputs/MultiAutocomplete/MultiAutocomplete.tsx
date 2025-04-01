import {
  Combobox,
  type ComboboxItem,
  OptionsDropdown,
  Pill,
  PillsInput,
  useCombobox,
} from "@mantine/core";

export type MultiAutocompleteProps = {
  value: ComboboxItem[];
  placeholder?: string;
  onChange: (newValue: string[]) => void;
};

export function MultiAutocomplete({ placeholder }: MultiAutocompleteProps) {
  const combobox = useCombobox();

  return (
    <Combobox store={combobox}>
      <Combobox.DropdownTarget>
        <PillsInput>
          <Pill.Group>
            <Combobox.EventsTarget>
              <PillsInput.Field placeholder={placeholder} />
            </Combobox.EventsTarget>
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>
      <OptionsDropdown
        data={[]}
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
