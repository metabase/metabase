import { Select, Loader } from "metabase/ui";

import { PickerIcon } from "./ParameterValuePicker.styled";
import { handleInputKeyup } from "./handleInputKeyup";
import S from "./style.css";

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

// TODO show "remove" button when typing in search for static list parameters
// TODO dropdown position + change of size doesn't work well, make maxDropdownHeight work (Select.styles.tsx)
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
    <div data-testid="listpicker-loader">
      <Loader size="xs" />
    </div>
  ) : value ? (
    <PickerIcon name="close" onClick={onClear} />
  ) : null;

  return (
    <Select
      classNames={{ dropdown: S.dropdown }}
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
      onDropdownOpen={onDropdownOpen}
      selectOnBlur
      inputWrapperOrder={["label", "input", "error", "description"]}
    />
  );
}
