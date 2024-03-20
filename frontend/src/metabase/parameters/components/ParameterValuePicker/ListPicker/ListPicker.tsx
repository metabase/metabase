import { Select, Loader } from "metabase/ui";

import { PickerIcon } from "../ParameterValuePicker.styled";
import { blurOnCommitKey } from "../util";

import S from "./ListPicker.css";

interface ListPickerProps {
  data: string[];
  value: string | null;
  searchValue: string;
  placeholder: string;
  notFoundMessage: string | null;
  errorMessage: string | null;
  isLoading: boolean;
  onChange: (value: string | null) => void;
  onSearchChange: (searchValue: string) => void;
  onDropdownOpen: () => void;
  onDropdownClose: () => void;
}

// TODO show "remove" button when typing, static list parameters (metabase#40226)
export function ListPicker({
  data,
  value,
  placeholder,
  notFoundMessage,
  errorMessage,
  isLoading,
  onChange,
  onSearchChange,
  onDropdownOpen,
  onDropdownClose,
}: ListPickerProps) {
  const icon = isLoading ? (
    <div data-testid="listpicker-loader">
      <Loader size="xs" />
    </div>
  ) : value ? (
    <PickerIcon name="close" onClick={() => onChange(null)} />
  ) : null;

  return (
    <Select
      // This is required until we fix the Select to support maxDropdownHeight
      classNames={{ dropdown: S.dropdown }}
      data={data}
      value={value}
      rightSection={icon}
      placeholder={placeholder}
      nothingFound={notFoundMessage}
      error={errorMessage}
      inputWrapperOrder={["label", "input", "error", "description"]}
      searchable
      onKeyUp={blurOnCommitKey}
      onChange={onChange}
      onSearchChange={onSearchChange}
      onDropdownOpen={onDropdownOpen}
      onDropdownClose={onDropdownClose}
    />
  );
}
