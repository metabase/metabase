import { Select, Loader } from "metabase/ui";

import { PickerIcon } from "../ParameterValuePicker.styled";
import { blurOnCommitKey } from "../util";

import S from "./ListPicker.css";

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

// TODO show "remove" button when typing, static list parameters (metabase#40226)
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
      // This is required until we fix the Select to support maxDropdownHeight
      classNames={{ dropdown: S.dropdown }}
      error={errorMessage}
      value={value}
      data={values}
      onChange={onChange}
      rightSection={icon}
      placeholder={placeholder}
      searchable={enableSearch}
      onKeyUp={blurOnCommitKey}
      nothingFound={noResultsText}
      onSearchChange={onSearchChange}
      onDropdownOpen={onDropdownOpen}
      inputWrapperOrder={["label", "input", "error", "description"]}
    />
  );
}
