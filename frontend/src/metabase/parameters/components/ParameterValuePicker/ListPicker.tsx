import { Select, Loader } from "metabase/ui";

import { PickerIcon } from "./ParameterValuePicker.styled";
import { handleInputKeyup } from "./handleInputKeyup";

interface ListPickerProps {
  value: string;
  values: string[];
  onChange: (value: string) => void;
  onClear: () => void;
  onSearchChange?: (query: string) => void;
  onDropdownOpen?: () => void;
  enableSearch: boolean;
  isLoading: boolean;
  noResultsText: string;
  placeholder: string;
  errorMessage?: string;
}

// TODO show "remove" button when typing in search
// TODO dropdown position + change of size doesn't work well
export function ListPicker(props: ListPickerProps) {
  const {
    value,
    values,
    onChange,
    onClear,
    onSearchChange,
    onDropdownOpen,
    enableSearch,
    placeholder,
    noResultsText,
    isLoading,
    errorMessage,
  } = props;

  const icon = isLoading ? (
    <Loader size="xs" />
  ) : value ? (
    <PickerIcon name="close" onClick={onClear} />
  ) : null;

  return (
    <Select
      error={errorMessage}
      value={value}
      data={values}
      onChange={onChange}
      rightSection={icon}
      placeholder={placeholder}
      searchable={enableSearch}
      onKeyUp={handleInputKeyup}
      nothingFound={noResultsText}
      onSearchChange={onSearchChange}
      // TODO make dropdown maxHeight work (Select.styles.tsx)
      // maxDropdownHeight={300}
      onDropdownOpen={onDropdownOpen}
    />
  );
}
