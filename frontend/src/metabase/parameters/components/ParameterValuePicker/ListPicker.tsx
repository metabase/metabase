import { useMemo } from "react";
import _ from "underscore";

import { Select, Loader } from "metabase/ui";

import { PickerIcon } from "./ParameterValuePicker.styled";
import { handleInputKeyup } from "./handleInputKeyup";

interface ListPickerProps {
  value: string;
  values: string[];
  onChange: (value: string) => void;
  onClear: () => void;
  onSearchChange?: (query: string) => void;
  searchDebounceMs?: number;
  onDropdownOpen?: () => void;
  enableSearch: boolean;
  isLoading: boolean;
  noResultsText: string;
  placeholder: string;
}

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
    searchDebounceMs = 250,
  } = props;
  const icon = isLoading ? (
    <Loader size="xs" />
  ) : value ? (
    <PickerIcon name="close" onClick={onClear} />
  ) : null;

  const onSearchDebounced = useMemo(() => {
    if (onSearchChange) {
      return _.debounce((query: string) => {
        onSearchChange(query);
      }, searchDebounceMs);
    }
    return undefined;
  }, [onSearchChange, searchDebounceMs]);

  return (
    <Select
      value={value}
      data={values}
      onChange={onChange}
      rightSection={icon}
      placeholder={placeholder}
      searchable={enableSearch}
      onKeyUp={handleInputKeyup}
      nothingFound={noResultsText}
      onSearchChange={onSearchDebounced}
      // TODO make dropdown maxHeight work (Select.styles.tsx)
      // maxDropdownHeight={300}
      onDropdownOpen={onDropdownOpen}
    />
  );
}
