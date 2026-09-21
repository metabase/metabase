import {
  Combobox,
  InputBase,
  type AutocompleteProps as MantineAutocompleteProps,
  OptionsDropdown,
  useProps,
} from "@mantine/core";

import { useAutocomplete } from "./use-autocomplete";

export type AutocompleteProps = Omit<MantineAutocompleteProps, "onChange"> & {
  parseValue?: (rawValue: string) => string | null;
  onChange?: (value: string) => void;
  onSearchChange?: (rawValue: string) => void;
};

const defaultParseValue = (rawValue: string) => {
  const trimmedValue = rawValue.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

export const Autocomplete = (props: AutocompleteProps) => {
  const {
    unstyled,
    size,
    value,
    defaultValue,
    data,
    parseValue = defaultParseValue,
    selectFirstOptionOnChange,
    readOnly,
    disabled,
    error,
    rightSection,
    filter,
    limit,
    withScrollArea,
    maxDropdownHeight,
    scrollAreaProps,
    renderOption,
    comboboxProps,
    autoSelectOnBlur,
    openOnFocus,
    onChange,
    onSearchChange,
    onFocus,
    onBlur,
    onClick,
    onDropdownOpen,
    onDropdownClose,
    onOptionSubmit,
    ...inputProps
  } = useProps("Autocomplete", null, props);

  const {
    combobox,
    parsedData,
    inputValue,
    handleInputChange,
    handleFocus,
    handleBlur,
    handleClick,
    handleOptionSubmit,
  } = useAutocomplete({
    value,
    defaultValue,
    data,
    selectFirstOptionOnChange,
    autoSelectOnBlur,
    openOnFocus,
    parseValue,
    onChange,
    onSearchChange,
    onFocus,
    onBlur,
    onClick,
    onDropdownOpen,
    onDropdownClose,
    onOptionSubmit,
  });

  return (
    <Combobox
      store={combobox}
      unstyled={unstyled}
      readOnly={readOnly}
      size={size}
      keepMounted={autoSelectOnBlur}
      onOptionSubmit={handleOptionSubmit}
      {...comboboxProps}
    >
      <Combobox.Target>
        <InputBase
          {...inputProps}
          unstyled={unstyled}
          size={size}
          value={inputValue}
          error={error}
          rightSection={rightSection}
          readOnly={readOnly}
          disabled={disabled}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onClick={handleClick}
        />
      </Combobox.Target>
      <OptionsDropdown
        data={parsedData}
        hidden={readOnly || disabled}
        filter={filter}
        search={inputValue}
        limit={limit}
        hiddenWhenEmpty
        withScrollArea={withScrollArea}
        maxDropdownHeight={maxDropdownHeight}
        unstyled={unstyled}
        labelId={undefined}
        aria-label={inputProps["aria-label"]}
        renderOption={renderOption}
        scrollAreaProps={scrollAreaProps}
      />
    </Combobox>
  );
};
