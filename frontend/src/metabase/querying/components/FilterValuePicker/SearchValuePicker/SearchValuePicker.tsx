import { useMemo, useState } from "react";
import { useAsync, useDebounce } from "react-use";

import type { FieldId, FieldValue } from "metabase-types/api";

import { SelectValuePicker } from "../SelectValuePicker";
import { getAvailableOptions, getOptionsWithSearchInput } from "../utils";

import { SEARCH_DEBOUNCE } from "./constants";
import { getSearchValues, shouldSearch } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder: string;
  isAutoFocus: boolean;
  isMultiple: boolean;
  isValueValid: (query: string) => boolean;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  fieldValues: initialFieldValues,
  selectedValues,
  placeholder,
  isAutoFocus,
  isMultiple,
  isValueValid,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);

  const { value: fieldValues = initialFieldValues } = useAsync(
    () => getSearchValues(fieldId, searchFieldId, searchQuery),
    [fieldId, searchFieldId, searchQuery],
  );

  const options = useMemo(
    () => getAvailableOptions(fieldValues, selectedValues),
    [fieldValues, selectedValues],
  );

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);
    if (newSearchValue === "") {
      setSearchQuery(newSearchValue);
    }
  };

  const handleSearchTimeout = () => {
    if (shouldSearch(searchValue, searchQuery, fieldValues)) {
      setSearchQuery(searchValue);
    }
  };

  useDebounce(handleSearchTimeout, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <SelectValuePicker
      data={getOptionsWithSearchInput(options, searchValue, isValueValid)}
      value={selectedValues}
      searchValue={searchValue}
      placeholder={placeholder}
      isAutoFocus={isAutoFocus}
      isMultiple={isMultiple}
      onChange={onChange}
      onSearchChange={handleSearchChange}
    />
  );
}
